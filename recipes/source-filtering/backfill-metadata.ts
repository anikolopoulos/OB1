#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Open Brain — Retroactive Metadata Extraction
 *
 * Finds thoughts missing LLM-extracted metadata (type, topics, people, etc.)
 * and backfills them using the same gpt-4o-mini extraction prompt that
 * capture_thought uses.
 *
 * Typical use: email-imported thoughts that were inserted via direct PostgreSQL
 * (skipping the ingest endpoint) have embeddings but no structured metadata.
 *
 * Usage:
 *   deno run --allow-net --allow-env backfill-metadata.ts [options]
 *
 * Options:
 *   --source=gmail          Only backfill thoughts from this source (default: all)
 *   --limit=100             Max thoughts to process (default: 100)
 *   --dry-run               Show what would be updated without writing
 *   --batch-size=10         Concurrent requests per batch (default: 10)
 *
 * Environment variables:
 *   DATABASE_URL      PostgreSQL connection string (required)
 *   LITELLM_BASE_URL  LiteLLM base URL (default: http://localhost:4000/v1)
 *   LITELLM_API_KEY   LiteLLM API key (required)
 *   LLM_MODEL         LLM model name (default: gpt-4o-mini)
 */

import pg from "npm:pg";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const LITELLM_BASE_URL = (Deno.env.get("LITELLM_BASE_URL") || "http://localhost:4000/v1").replace(/\/$/, "");
const LITELLM_API_KEY = Deno.env.get("LITELLM_API_KEY");
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "gpt-4o-mini";

if (!DATABASE_URL || !LITELLM_API_KEY) {
  console.error("Missing required env vars: DATABASE_URL, LITELLM_API_KEY");
  Deno.exit(1);
}

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  source: string | null;
  limit: number;
  dryRun: boolean;
  batchSize: number;
}

function parseArgs(): Args {
  const args: Args = { source: null, limit: 100, dryRun: false, batchSize: 10 };
  for (const arg of Deno.args) {
    if (arg.startsWith("--source=")) args.source = arg.split("=")[1];
    else if (arg.startsWith("--limit=")) args.limit = parseInt(arg.split("=")[1]);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--batch-size=")) args.batchSize = parseInt(arg.split("=")[1]);
  }
  return args;
}

// ─── Metadata Extraction (same prompt as MCP server) ─────────────────────────

const EXTRACT_PROMPT = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
- "sentiment": one of "positive", "negative", "neutral", "mixed"
Only extract what's explicitly there.`;

async function extractMetadata(text: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LITELLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`LiteLLM failed: ${r.status} ${msg}`);
  }

  const d = await r.json();
  try {
    return JSON.parse(d.choices[0].message.content);
  } catch {
    return { topics: ["uncategorized"], type: "observation" };
  }
}

// ─── PostgreSQL helpers ──────────────────────────────────────────────────────

interface Thought {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

async function fetchThoughtsMissingMetadata(
  pool: pg.Pool,
  source: string | null,
  limit: number,
): Promise<Thought[]> {
  // Find thoughts where metadata has no 'type' key (the primary indicator of LLM extraction)
  let queryText = `
    SELECT id, content, metadata
    FROM thoughts
    WHERE metadata->>'type' IS NULL
  `;
  const params: unknown[] = [];

  if (source) {
    params.push(source);
    queryText += ` AND metadata->>'source' = $${params.length}`;
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(queryText, params);
  return result.rows;
}

async function updateThoughtMetadata(
  pool: pg.Pool,
  id: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    await pool.query(
      `UPDATE thoughts SET metadata = $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(metadata), id],
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log(`\nOpen Brain — Metadata Backfill`);
  console.log(`  Source filter: ${args.source || "all"}`);
  console.log(`  Limit: ${args.limit}`);
  console.log(`  Batch size: ${args.batchSize}`);
  console.log(`  Mode: ${args.dryRun ? "DRY RUN" : "LIVE"}\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const thoughts = await fetchThoughtsMissingMetadata(pool, args.source, args.limit);
    console.log(`Found ${thoughts.length} thought(s) missing metadata.\n`);

    if (thoughts.length === 0) return;

    let updated = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < thoughts.length; i += args.batchSize) {
      const batch = thoughts.slice(i, i + args.batchSize);
      const batchNum = Math.floor(i / args.batchSize) + 1;
      const totalBatches = Math.ceil(thoughts.length / args.batchSize);
      console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} thoughts)...`);

      const results = await Promise.allSettled(
        batch.map(async (thought) => {
          const extracted = await extractMetadata(thought.content);

          if (args.dryRun) {
            console.log(`  [DRY] ${thought.id}: type=${extracted.type}, topics=${(extracted.topics as string[])?.join(", ")}`);
            return;
          }

          // Merge: keep existing metadata (source, gmail_labels, etc.), add extracted fields
          const merged = { ...thought.metadata, ...extracted };
          const ok = await updateThoughtMetadata(pool, thought.id, merged);

          if (ok) {
            updated++;
            console.log(`  + ${thought.id}: type=${extracted.type}, topics=${(extracted.topics as string[])?.join(", ")}`);
          } else {
            errors++;
            console.error(`  x ${thought.id}: update failed`);
          }
        }),
      );

      for (const r of results) {
        if (r.status === "rejected") {
          errors++;
          console.error(`  x Error: ${r.reason}`);
        }
      }

      // Rate limit between batches
      if (i + args.batchSize < thoughts.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log(`\nDone.`);
    if (!args.dryRun) {
      console.log(`  Updated: ${updated}`);
      console.log(`  Errors: ${errors}`);
    } else {
      console.log(`  Would update: ${thoughts.length} thoughts`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  Deno.exit(1);
});
