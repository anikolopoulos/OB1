# Email History Import

> Import your Gmail email history into Open Brain as searchable, embedded thoughts.

Your email is full of decisions, commitments, and context that your AI has never seen. This recipe connects to Gmail, pulls the emails that matter (filtering out receipts, auto-replies, and noise), and loads them into your Open Brain. Once imported, your AI can recall what you said to someone three months ago, find that pricing discussion from last quarter, or surface commitments you forgot about.

## What It Does

Pulls your Gmail history via the Gmail API and loads each email into Open Brain as a single thought. The script generates embeddings and extracts metadata (topics, people, action items) locally via LiteLLM, then inserts directly into PostgreSQL with SHA-256 content fingerprint dedup.

**One email = one thought.** No chunking, no parent/child relationships. This aligns with how the OB1 community handles long content (truncate for embedding, store full content).

## Prerequisites

- Working Open Brain setup ([guide](../../docs/01-getting-started.md))
- Deno runtime installed
- Google Cloud project with Gmail API enabled
- Gmail API OAuth credentials (Client ID + Client Secret)
- LiteLLM API key (same one from your Open Brain setup)

## Credential Tracker

Copy this block into a text editor and fill it in as you go.

```text
EMAIL HISTORY IMPORT -- CREDENTIAL TRACKER
--------------------------------------

FROM YOUR OPEN BRAIN SETUP
  DATABASE_URL:          ____________
  LiteLLM API Key:       ____________

GENERATED DURING SETUP
  Google Cloud Project ID:     ____________
  Gmail OAuth Client ID:       ____________.apps.googleusercontent.com
  Gmail OAuth Client Secret:   ____________

--------------------------------------
```

## Setup

1. **Enable Gmail API** in your Google Cloud project
2. **Create OAuth 2.0 credentials** (Desktop app type) and download as `credentials.json` into this folder
3. **Set environment variables:**

   ```bash
   export DATABASE_URL=postgresql://user:pass@localhost:5432/open_brain
   export LITELLM_API_KEY=your-litellm-key
   ```

4. **First run — authenticate:**

   ```bash
   deno run --allow-net --allow-read --allow-write --allow-env pull-gmail.ts --dry-run --limit=5
   ```

   This opens a browser window for OAuth consent. After authorizing, your token is cached in `token.json`.

## Usage

```bash
# Dry run — see what would be imported
deno run --allow-net --allow-read --allow-write --allow-env pull-gmail.ts --dry-run

# Import sent emails from the last 90 days
deno run --allow-net --allow-read --allow-write --allow-env pull-gmail.ts --window=90d --limit=500

# Import starred emails
deno run --allow-net --allow-read --allow-write --allow-env pull-gmail.ts --labels=STARRED

# List all Gmail labels
deno run --allow-net --allow-read --allow-write --allow-env pull-gmail.ts --list-labels
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--window=` | `24h` | Time window: `24h`, `7d`, `30d`, `90d`, `1y`, `all` |
| `--labels=` | `SENT` | Comma-separated Gmail labels |
| `--limit=` | `50` | Max emails to process |
| `--dry-run` | off | Preview without ingesting |
| `--list-labels` | off | List all Gmail labels and exit |
| `--ingest-endpoint` | off | Use `INGEST_URL`/`INGEST_KEY` instead of direct database insert |

### Ingestion modes

**Default (direct insert)** — The script generates embeddings and extracts metadata via LiteLLM, then inserts directly into PostgreSQL with content fingerprint dedup. Requires `DATABASE_URL`, `LITELLM_API_KEY`. This matches the pattern used by the ChatGPT import and MCP server.

**`--ingest-endpoint`** — POSTs to a custom MCP server endpoint that handles embedding and metadata server-side. Requires `INGEST_URL` and `INGEST_KEY`. Use this if you have a custom ingest-thought function deployed.

## How It Works

1. **Fetch** emails from Gmail API by label and time window
2. **Extract** body (base64 decode, HTML-to-text, strip quoted replies and signatures)
3. **Filter** out noise (no-reply senders, receipts, auto-generated, <10 words)
4. **Deduplicate** via sync-log (tracks Gmail message IDs already imported)
5. **Embed** content via LiteLLM (`text-embedding-3-small`)
6. **Classify** via LLM (topics, type, people, action items)
7. **Upsert** into PostgreSQL with SHA-256 [content fingerprint](../../primitives/content-fingerprint-dedup/README.md) — re-running produces zero duplicates

### What gets filtered out

- Auto-generated emails (receipts, confirmations, password resets)
- No-reply / notification senders
- Emails with <10 words after cleanup
- Quoted replies and email signatures are stripped before ingestion

## Expected Outcome

Each imported email becomes one row in the `thoughts` table:
- `content`: Email body with context prefix (`[Email from X | Subject: Y | Date: Z]`)
- `embedding`: 1536-dim vector for semantic search (truncated to 8K chars)
- `metadata`: LLM-extracted topics, type, people, action items, plus `source: "gmail"`, `gmail_id`, `gmail_labels`, `gmail_thread_id`
- `content_fingerprint`: Normalized SHA-256 hash for dedup (see [content fingerprint primitive](../../primitives/content-fingerprint-dedup/README.md))

## Troubleshooting

**OAuth flow fails:** Make sure your redirect URI in Google Cloud Console is `http://localhost:3847/callback`.

**No thoughts appear:** Check that `DATABASE_URL` is correct and the PostgreSQL container is running (`docker compose ps`).

**Re-running imports the same emails:** The `sync-log.json` file tracks imported Gmail IDs. Delete it to re-import everything. Content fingerprints provide a second layer of dedup at the database level.

**Embedding/metadata errors:** Verify your `LITELLM_API_KEY` has credits. The script calls LiteLLM for both embedding generation and metadata extraction.
