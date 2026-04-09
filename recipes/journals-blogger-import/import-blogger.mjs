#!/usr/bin/env node
/**
 * Journals/Blogger Import for Open Brain (OB1-compatible)
 *
 * Parses Google Blogger Atom XML exports and imports blog posts as thoughts
 * with embeddings. Works with any Atom feed export.
 *
 * Usage:
 *   node import-blogger.mjs /path/to/blogger-exports [--dry-run] [--skip N] [--limit N]
 *
 * Expects a directory containing .atom files (Blogger export format).
 */

import pg from "pg";
import { createHash } from "crypto";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || "http://localhost:4000/v1";
const LITELLM_API_KEY = process.env.LITELLM_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

if (!DATABASE_URL || !LITELLM_API_KEY) {
  console.error("Missing required env vars: DATABASE_URL, LITELLM_API_KEY");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const args = process.argv.slice(2);
const dirPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skip = parseInt(args[args.indexOf("--skip") + 1]) || 0;
const limit = parseInt(args[args.indexOf("--limit") + 1]) || Infinity;

if (!dirPath) {
  console.error("Usage: node import-blogger.mjs /path/to/blogger-exports [--dry-run] [--skip N] [--limit N]");
  process.exit(1);
}

function contentFingerprint(text) {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAtomFile(xml) {
  const entries = [];
  const entryBlocks = xml.split(/<entry>/);

  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i];
    const endIdx = block.indexOf("</entry>");
    if (endIdx === -1) continue;
    const entry = block.substring(0, endIdx);

    // Check if it's a POST or COMMENT (skip settings, templates, etc.)
    const categoryMatch = entry.match(/term="http:\/\/schemas\.google\.com\/blogger\/2008\/kind#(\w+)"/);
    const kind = categoryMatch ? categoryMatch[1] : "";
    if (kind !== "post" && kind !== "comment") continue;

    // Extract fields
    const titleMatch = entry.match(/<title[^>]*>([^<]*)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const rawContent = contentMatch ? contentMatch[1] : "";
    const content = stripHtml(rawContent);

    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const published = publishedMatch ? publishedMatch[1] : "";

    // Skip very short entries
    if (content.length < 20) continue;

    entries.push({ title, content, published, kind });
  }

  return entries;
}

async function findAtomFiles(dir) {
  const results = [];

  async function walk(d, depth) {
    if (depth > 3) return;
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = join(d, e.name);
      if (e.isFile() && (e.name.endsWith(".atom") || e.name === "feed.atom")) {
        results.push(fullPath);
      } else if (e.isDirectory() && !e.name.startsWith(".")) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(dir, 0);
  return results;
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

async function upsertThought(content, metadata, embedding, createdAt) {
  const fingerprint = contentFingerprint(content);
  const result = await pool.query(
    `INSERT INTO thoughts (content, embedding, metadata, content_fingerprint, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (content_fingerprint) WHERE content_fingerprint IS NOT NULL
     DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      content,
      JSON.stringify(embedding),
      JSON.stringify({
        ...metadata,
        source: "blogger_import",
        source_type: "blogger_import",
      }),
      fingerprint,
      createdAt,
    ]
  );
  const row = result.rows[0];
  return { thought_id: row.id, action: row.inserted ? "inserted" : "updated" };
}

async function main() {
  console.log(`Journals/Blogger Import`);
  console.log(`Directory: ${dirPath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE IMPORT"}`);
  console.log();

  const atomFiles = await findAtomFiles(dirPath);
  console.log(`Found ${atomFiles.length} Atom files`);

  const allPosts = [];
  for (const file of atomFiles) {
    const xml = await readFile(file, "utf-8");
    const entries = parseAtomFile(xml);
    console.log(`  ${file}: ${entries.length} entries`);
    allPosts.push(...entries);
  }

  console.log(`\nTotal entries: ${allPosts.length}`);

  const toProcess = allPosts.slice(skip, skip + limit);
  console.log(`Processing ${toProcess.length} (skip=${skip}, limit=${limit === Infinity ? "all" : limit})`);
  console.log();

  let imported = 0, skipped = 0, errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const post = toProcess[i];
    try {
      const thoughtContent = post.title
        ? `Blog post: ${post.title}\nPublished: ${post.published}\n\n${post.content}`
        : post.content;

      if (thoughtContent.trim().length < 50) { skipped++; continue; }

      const truncated = thoughtContent.length > 30000
        ? thoughtContent.substring(0, 30000) + "\n\n[... truncated]"
        : thoughtContent;
      const createdAt = post.published || new Date().toISOString();
      const title = post.title || `Blog ${post.kind} (${createdAt.slice(0, 10)})`;

      if (dryRun) {
        console.log(`[${i + 1}/${toProcess.length}] Would import: "${title}" (${truncated.length} chars)`);
        imported++;
        continue;
      }

      const embedding = await getEmbedding(truncated);
      const result = await upsertThought(
        truncated,
        { title, kind: post.kind },
        embedding,
        createdAt
      );
      console.log(`[${i + 1}/${toProcess.length}] ${result.action}: #${result.thought_id} "${title}"`);
      imported++;
    } catch (err) {
      console.error(`[${i + 1}/${toProcess.length}] Error: ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log(`Done! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);

  await pool.end();
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
