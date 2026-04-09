#!/usr/bin/env node
/**
 * Find and remove duplicate thoughts that have NULL content_fingerprint
 * when a canonical copy (with fingerprint) already exists.
 *
 * Default behavior: REPORT ONLY. Pass --delete to actually remove duplicates.
 *
 * Strategy:
 *   1. Fetch batches of NULL-fingerprint rows (id cursor, ascending)
 *   2. Compute fingerprint for each using canonical normalization
 *   3. Batch-lookup which fingerprints already exist in the table
 *   4. Report (or delete) confirmed duplicates
 *   5. For genuine orphans (no duplicate), backfill the fingerprint
 *
 * Fingerprint normalization matches the content-fingerprint-dedup primitive:
 *   trim + collapse whitespace + lowercase + strip trailing punctuation +
 *   strip possessives + strip trailing 's' from words > 3 chars
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse CLI flags ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DESTRUCTIVE = args.includes("--delete");
const REPORT_ONLY = args.includes("--report-only") || !DESTRUCTIVE;

// ── Load environment ────────────────────────────────────────────────────────

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = {
  ...loadEnv(path.join(__dirname, ".env")),
  ...loadEnv(path.join(__dirname, ".env.local")),
};

const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL.\n" +
      "Set it in .env, .env.local, or as an environment variable."
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ── Fingerprint logic (matches content-fingerprint-dedup primitive) ─────────

function normalizeForFingerprint(text) {
  let s = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!s) return "";
  s = s.replace(/[.!?;:,]+$/, "");
  s = s.replace(/['\u2019]s\b/g, "");
  s = s.replace(/(\w{4,})s$/, "$1");
  return s.trim();
}

function buildFingerprint(text) {
  const normalized = normalizeForFingerprint(text);
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

// ── Database helpers ────────────────────────────────────────────────────────

async function fetchBatch(cursorId, batchSize) {
  const result = await pool.query(
    `SELECT id, content
     FROM thoughts
     WHERE content_fingerprint IS NULL
       AND id > $1
     ORDER BY id ASC
     LIMIT $2`,
    [cursorId, batchSize]
  );
  return result.rows;
}

async function checkFingerprintsExist(hashes) {
  if (!hashes.length) return new Set();
  const existingSet = new Set();
  // Use ANY($1::text[]) for efficient batch lookup
  const result = await pool.query(
    `SELECT content_fingerprint
     FROM thoughts
     WHERE content_fingerprint = ANY($1::text[])`,
    [hashes]
  );
  for (const r of result.rows) {
    if (r.content_fingerprint) existingSet.add(r.content_fingerprint);
  }
  return existingSet;
}

async function deleteIds(ids) {
  if (!ids.length) return 0;
  const result = await pool.query(
    `DELETE FROM thoughts WHERE id = ANY($1::int[])`,
    [ids]
  );
  return result.rowCount;
}

async function patchFingerprint(id, fingerprint) {
  await pool.query(
    `UPDATE thoughts SET content_fingerprint = $1 WHERE id = $2`,
    [fingerprint, id]
  );
}

// ── State ───────────────────────────────────────────────────────────────────

const STATE_FILE = path.join(__dirname, "cleanup-state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      cursorId: 0,
      totalDeleted: 0,
      totalPatched: 0,
      totalWouldDelete: 0,
      totalErrors: 0,
      batches: 0,
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Main ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function main() {
  const state = loadState();

  if (REPORT_ONLY) {
    console.log("=== Duplicate Report (read-only) ===");
    console.log(
      "Run with --delete to actually remove duplicates.\n"
    );
  } else {
    console.log("=== Delete Duplicate NULL-Fingerprint Rows ===");
    console.log("WARNING: This will DELETE rows. Ctrl+C to abort.\n");
  }

  console.log(
    `Resuming from cursor id=${state.cursorId} (deleted: ${state.totalDeleted}, patched: ${state.totalPatched})`
  );
  console.log(`Batch size: ${BATCH_SIZE}\n`);

  try {
    while (true) {
      state.batches++;
      process.stdout.write(
        `Batch ${state.batches}: fetching from id>${state.cursorId}… `
      );

      let rows;
      try {
        rows = await fetchBatch(state.cursorId, BATCH_SIZE);
      } catch (err) {
        console.error("\n  Fetch error:", err.message, "— retrying in 5s…");
        await new Promise((r) => setTimeout(r, 5000));
        state.batches--;
        continue;
      }

      if (!rows || rows.length === 0) {
        console.log("(no rows) — Done.");
        break;
      }

      console.log(`${rows.length} rows`);

      const rowsWithFp = rows.map((row) => ({
        id: row.id,
        fingerprint: buildFingerprint(row.content),
      }));

      const allHashes = rowsWithFp.map((r) => r.fingerprint);
      let existingSet;
      try {
        existingSet = await checkFingerprintsExist(allHashes);
      } catch (err) {
        console.error(
          "  Check-exists error:",
          err.message,
          "— retrying in 5s…"
        );
        await new Promise((r) => setTimeout(r, 5000));
        state.batches--;
        continue;
      }

      const duplicateRows = rowsWithFp.filter((r) =>
        existingSet.has(r.fingerprint)
      );
      const orphanRows = rowsWithFp.filter(
        (r) => !existingSet.has(r.fingerprint)
      );

      process.stdout.write(
        `  ${duplicateRows.length} duplicates, ${orphanRows.length} orphans. `
      );

      if (REPORT_ONLY) {
        state.totalWouldDelete += duplicateRows.length;
        console.log(`(would delete ${duplicateRows.length})`);
      } else {
        // Delete duplicates
        let deletedThisBatch = 0;
        if (duplicateRows.length > 0) {
          try {
            deletedThisBatch = await deleteIds(
              duplicateRows.map((r) => r.id)
            );
            state.totalDeleted += deletedThisBatch;
          } catch (err) {
            state.totalErrors++;
            console.error("\n  DELETE error:", err.message);
          }
        }

        // Patch genuine orphans
        let patchedThisBatch = 0;
        for (const { id, fingerprint } of orphanRows) {
          try {
            await patchFingerprint(id, fingerprint);
            patchedThisBatch++;
            state.totalPatched++;
          } catch (err) {
            state.totalErrors++;
            console.warn(
              `  PATCH orphan error id=${id}:`,
              err.message.slice(0, 120)
            );
          }
        }

        console.log(
          `Deleted ${deletedThisBatch}, patched ${patchedThisBatch}.`
        );
      }

      // Advance cursor
      const maxId = rows[rows.length - 1].id;
      state.cursorId = maxId;
      saveState(state);

      console.log(
        `  Totals: deleted=${state.totalDeleted}, patched=${state.totalPatched}, ` +
          `would-delete=${state.totalWouldDelete}, errors=${state.totalErrors}. ` +
          `Cursor: ${state.cursorId}`
      );

      await new Promise((r) => setTimeout(r, 200));
    }

    console.log();
    console.log("=== COMPLETE ===");
    if (REPORT_ONLY) {
      console.log(`Total rows that would be deleted: ${state.totalWouldDelete}`);
      console.log(`\nRun with --delete to actually remove them.`);
    } else {
      console.log(`Total rows deleted  : ${state.totalDeleted}`);
      console.log(`Total rows patched  : ${state.totalPatched}`);
      console.log(`Total errors        : ${state.totalErrors}`);
    }

    try {
      fs.unlinkSync(STATE_FILE);
    } catch {}
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
