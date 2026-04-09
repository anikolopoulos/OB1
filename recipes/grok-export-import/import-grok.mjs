#!/usr/bin/env node
/**
 * Grok Export Import for Open Brain (OB1-compatible)
 *
 * Parses xAI Grok conversation exports (JSON with MongoDB-style dates) and imports
 * each conversation as a thought with embeddings.
 *
 * Usage:
 *   node import-grok.mjs /path/to/grok-export.json [--dry-run] [--skip N] [--limit N]
 */

import pg from "pg";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || "http://localhost:4000/v1";
const LITELLM_API_KEY = process.env.LITELLM_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skip = parseInt(args[args.indexOf("--skip") + 1]) || 0;
const limit = parseInt(args[args.indexOf("--limit") + 1]) || Infinity;

if (!filePath) {
  console.error("Usage: node import-grok.mjs /path/to/grok-export.json [--dry-run] [--skip N] [--limit N]");
  process.exit(1);
}

function contentFingerprint(text) {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function parseMongoDate(dateObj) {
  if (!dateObj) return null;
  if (dateObj.$date) {
    if (typeof dateObj.$date === "string") return dateObj.$date;
    if (dateObj.$date.$numberLong) return new Date(parseInt(dateObj.$date.$numberLong)).toISOString();
  }
  if (typeof dateObj === "string") return dateObj;
  return null;
}

function normalizeConversation(conv) {
  const title = conv.title || conv.name || "Untitled Grok Chat";
  const createdAt = parseMongoDate(conv.create_time || conv.createdAt) || new Date().toISOString();

  // Extract messages — Grok uses nested .conversation and .response structures
  const messages = [];
  const rawMessages = conv.conversation || conv.messages || conv.responses || [];

  for (const msg of rawMessages) {
    const sender = (msg.sender || msg.role || "unknown").toLowerCase();
    const text = (msg.message || msg.text || msg.content || "").trim();
    if (!text) continue;

    messages.push({
      role: sender === "user" || sender === "human" ? "USER" : "ASSISTANT",
      text,
    });
  }

  const transcript = messages.map((m) => `${m.role}: ${m.text}`).join("\n\n");
  const content = `Conversation title: ${title}\nConversation created at: ${createdAt}\n\n${transcript}`;

  return { title, createdAt, content };
}

async function getEmbedding(text) {
  const truncated = text.length > 8000 ? text.substring(0, 8000) : text;
  const response = await fetch(`${LITELLM_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LITELLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: truncated }),
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(`Embedding failed: ${response.status} ${msg}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}

async function upsertThought(pool, content, metadata, embedding, createdAt) {
  const fingerprint = contentFingerprint(content);
  const result = await pool.query(
    `INSERT INTO thoughts (content, embedding, metadata, content_fingerprint, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (content_fingerprint) WHERE content_fingerprint IS NOT NULL
     DO UPDATE SET metadata = EXCLUDED.metadata || thoughts.metadata, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      content,
      JSON.stringify(embedding),
      JSON.stringify({
        ...metadata,
        source: "grok_import",
      }),
      fingerprint,
      createdAt,
    ]
  );
  const row = result.rows[0];
  return { thought_id: row.id, action: row.inserted ? "inserted" : "updated" };
}

async function main() {
  if (!dryRun && (!DATABASE_URL || !LITELLM_API_KEY)) {
    console.error("Missing required env vars: DATABASE_URL, LITELLM_API_KEY");
    process.exit(1);
  }

  console.log(`Grok Export Import`);
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE IMPORT"}`);
  console.log();

  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  // Grok exports can have conversations at top level or nested
  const conversations = parsed.conversations || (Array.isArray(parsed) ? parsed : [parsed]);
  console.log(`Found ${conversations.length} conversations`);

  const toProcess = conversations.slice(skip, skip + limit);
  console.log(`Processing ${toProcess.length} (skip=${skip}, limit=${limit === Infinity ? "all" : limit})`);
  console.log();

  const pool = dryRun ? null : new pg.Pool({ connectionString: DATABASE_URL });

  try {
    let imported = 0, skipped = 0, errors = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const conv = toProcess[i];
      try {
        const { title, createdAt, content } = normalizeConversation(conv);
        if (content.trim().length < 100) { skipped++; continue; }

        const truncated = content.length > 30000
          ? content.substring(0, 30000) + "\n\n[... truncated]"
          : content;

        if (dryRun) {
          console.log(`[${i + 1}/${toProcess.length}] Would import: "${title}" (${truncated.length} chars)`);
          imported++;
          continue;
        }

        const embedding = await getEmbedding(truncated);
        const result = await upsertThought(pool, truncated, { title }, embedding, createdAt);
        console.log(`[${i + 1}/${toProcess.length}] ${result.action}: #${result.thought_id} "${title}"`);
        imported++;
      } catch (err) {
        console.error(`[${i + 1}/${toProcess.length}] Error: ${err.message}`);
        errors++;
      }
    }

    console.log();
    console.log(`Done! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
  } finally {
    if (pool) await pool.end();
  }
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
