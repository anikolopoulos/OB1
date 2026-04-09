# Google Activity Import

<div align="center">

![Community Contribution](https://img.shields.io/badge/OB1_COMMUNITY-Approved_Contribution-2ea44f?style=for-the-badge&logo=github)

**Created by [@alanshurafa](https://github.com/alanshurafa)**

*Reviewed and merged by the Open Brain maintainer team — thank you for building the future of AI memory!*

</div>

> Import your Google Search, Gmail, Maps, YouTube, and Chrome history from Google Takeout into Open Brain as searchable thoughts.

## What It Does

Takes your Google Takeout data export, filters out noise (passive visits, trivial lookups, notifications), groups activity by day, uses an LLM to distill each day into 1-3 standalone thoughts, and loads them into your Open Brain with vector embeddings and metadata. The result is semantically searchable knowledge extracted from years of Google activity — your research patterns, decisions, habits, and interests.

## Prerequisites

- Working Open Brain setup ([guide](../../docs/01-getting-started.md))
- Your Google Takeout data export (see Step 1 below)
- Node.js 18+
- Your PostgreSQL `DATABASE_URL` (from your Open Brain setup)
- LiteLLM API key (for LLM summarization and embedding generation)

## Credential Tracker

Copy this block into a text editor and fill it in as you go.

```text
GOOGLE ACTIVITY IMPORT -- CREDENTIAL TRACKER
--------------------------------------

FROM YOUR OPEN BRAIN SETUP
  DATABASE_URL:          ____________
  LiteLLM API key:       ____________

FILE LOCATION
  Path to Takeout folder:  ____________

--------------------------------------
```

## Steps

### 1. Request your data from Google Takeout

Go to [takeout.google.com](https://takeout.google.com):

1. Click **Deselect all** (top of the page)
2. Scroll down and check **My Activity**
3. Click **Multiple formats** and make sure it says **JSON** (not HTML)
4. Click **Next step** → **Create export**
5. Wait for the email (can take minutes to hours depending on size)
6. Download and extract the zip file

After extraction, you should have a folder structure like:

```
Takeout/
  My Activity/
    Search/
      MyActivity.json
    Gmail/
      MyActivity.json
    Maps/
      MyActivity.json
    YouTube/
      MyActivity.json
    Chrome/
      MyActivity.json
    ...
```

### 2. Navigate to this recipe folder

```bash
# From the OB1 repo root
cd recipes/google-activity-import
```

Or copy the files (`import-google-activity.mjs`, `package.json`) into any working directory.

### 3. Install dependencies

```bash
npm install
```

### 4. Set your environment variables

```bash
export DATABASE_URL=postgresql://ob1:password@localhost:5432/ob1
export LITELLM_BASE_URL=http://localhost:4000/v1
export LITELLM_API_KEY=your-litellm-api-key
```

All values come from your credential tracker. You can also copy `.env.example` to `.env` and fill it in, then run `export $(cat .env | xargs)`.

### 5. Do a dry run first

```bash
node import-google-activity.mjs ./path/to/Takeout/My\ Activity --dry-run --limit 5
```

This parses, filters, and summarizes 5 activity-days without writing anything to your database. Review the output to see what would be imported.

### 6. Run the full import

```bash
node import-google-activity.mjs ./path/to/Takeout/My\ Activity
```

The script will:
1. Find all `MyActivity.json` files in the folder tree
2. Filter to high-value categories (Search, Gmail, Maps, YouTube, Chrome)
3. Remove noise entries (passive visits, notifications, trivial lookups)
4. Group remaining entries by day
5. Summarize each day's activity into 1-3 standalone thoughts via LLM
6. Generate a vector embedding for each thought
7. Upsert each thought into your `thoughts` table (deduplication via SHA-256 content fingerprint)

Progress prints to the console. A sync log (`google-activity-sync-log.json`) tracks which days have been imported, so you can safely re-run the script after future Takeout exports without duplicating data.

### 7. Verify in your database

Connect to your PostgreSQL database and check the `thoughts` table:

```sql
SELECT content, metadata FROM thoughts
WHERE metadata->>'source' = 'google_activity'
ORDER BY created_at DESC
LIMIT 10;
```

You should see new rows with:
- `content`: prefixed with `[Google Search: 2024-06-15]` (or Gmail, Maps, etc.)
- `metadata`: includes `source: "google_activity"`, category, date, entry count
- `embedding`: a 1536-dimension vector

### 8. Test a search

In any MCP-connected AI (Claude Desktop, ChatGPT, etc.), ask:

```
Search my brain for things I researched about [topic you know you searched for]
```

## Expected Outcome

After a full import, your `thoughts` table contains distilled knowledge from years of Google activity. Each thought is a standalone statement about your research patterns, decisions, or interests — not a raw list of searches.

From a real production run with ~4 years of Google history:

| Metric | Value |
|--------|-------|
| Total activity entries | 98,000+ |
| After noise filtering | 42,000 |
| Activity-days | 11,000+ |
| Thoughts generated | ~8,000 |
| Estimated API cost | ~$0.30 |

The filtering is aggressive by design — most Google activity is noise. The script keeps only entries with enough substance to reveal patterns worth remembering.

## How It Works

### Three-stage pipeline

**Stage 1: Noise filtering** — Each activity entry passes through category-specific filters:

| Category | Kept | Filtered |
|----------|------|----------|
| Search | All searches ≥10 chars | Notification counts |
| Gmail | Email subjects ≥10 chars | Notification counts |
| Maps | Searches, directions, navigation | Passive visits, views, opens |
| YouTube | Searches, substantive watching | Short clips, passive visits |
| Chrome | Page titles ≥15 chars | Very short titles |

**Stage 2: Day grouping & summarization** — Surviving entries are grouped by date. Each day goes to an LLM (gpt-4o-mini via LiteLLM) with a tuned prompt. The LLM extracts 1-3 standalone thoughts per day, focusing on research patterns, decisions, and interests. Days with only trivial activity get empty summaries.

**Stage 3: Ingestion** — Each thought gets a vector embedding (text-embedding-3-small, 1536 dimensions) and is upserted into your `thoughts` table with a SHA-256 content fingerprint for deduplication.

### Deduplication

The sync log (`google-activity-sync-log.json`) stores a hash of each processed day's content, keyed by `category:date`. Re-running the script after a new Takeout export only processes:
- New days that weren't in the previous export
- Days whose content has changed (new entries appended)

Content fingerprints provide a second layer of dedup at the database level.

## Options Reference

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Parse, filter, summarize — don't write to database | Off |
| `--limit N` | Max activity-days to process (0 = unlimited) | 0 |
| `--after YYYY-MM-DD` | Only process activity after this date | None |
| `--before YYYY-MM-DD` | Only process activity before this date | None |
| `--categories LIST` | Comma-separated categories to process | Search,Gmail,Maps,YouTube,Chrome |
| `--raw` | Skip LLM summarization, insert grouped entries as-is | Off |
| `--verbose` | Print full thought text during processing | Off |

### Processing specific categories

```bash
# Only import search history
node import-google-activity.mjs ./Takeout/My\ Activity --categories Search

# Only import search and Gmail
node import-google-activity.mjs ./Takeout/My\ Activity --categories Search,Gmail
```

### Importing without LLM (free, private)

If you don't want to send your activity data to LiteLLM for summarization, use `--raw` mode:

```bash
node import-google-activity.mjs ./Takeout/My\ Activity --raw
```

This inserts the grouped daily entries as-is (e.g., "Google Search activity for 2024-06-15: Searched for X, Searched for Y..."). Embeddings still use LiteLLM. The thoughts won't be as clean, but your raw activity data stays private.

## Troubleshooting

**Issue: "No MyActivity.json files found"**
Solution: Make sure you selected **JSON** format (not HTML) when creating your Google Takeout export. The script looks for `MyActivity.json` files inside category subdirectories. If you see `MyActivity.html` files instead, re-create your Takeout with JSON format selected.

**Issue: `LITELLM_API_KEY required` error**
Solution: Make sure you've exported the environment variable in your current terminal session: `export LITELLM_API_KEY=your-key`. Environment variables don't persist between terminal windows.

**Issue: Import is very slow**
Solution: Each activity-day requires one LLM call (summarization) and 1-3 embedding calls. For 1,000+ days, expect 30-60 minutes. Use `--limit 10` to test first, then `--after 2024-01-01` to process recent activity, and expand the date range in later runs.

**Issue: Most days return "No thoughts extracted"**
Solution: This is expected. The LLM is deliberately selective — days with only routine searches or a single trivial lookup get empty summaries. Use `--raw` if you want to import everything without filtering.

**Issue: Want to re-import after a new Takeout export**
Solution: Just run the script again pointing at your new export. The sync log tracks which days have been processed by content hash. Only new or changed days will be imported. If you want to start completely fresh, delete `google-activity-sync-log.json`.

**Issue: `Failed to generate embedding` errors**
Solution: Check that your `LITELLM_API_KEY` is valid and your LiteLLM instance is running. Verify `LITELLM_BASE_URL` is reachable: `curl $LITELLM_BASE_URL/models`.

**Issue: No thoughts appear in database**
Solution: Check that `DATABASE_URL` is correct and the PostgreSQL container is running (`docker compose ps`). Test the connection: `psql $DATABASE_URL -c "SELECT count(*) FROM thoughts;"`.

**Issue: Want to import a category not in the default list**
Solution: Use `--categories` to specify any category that has a `MyActivity.json` file. For example: `--categories "Gemini Apps,Google Analytics"`. Run without `--categories` first using `--dry-run` to see all available categories.
