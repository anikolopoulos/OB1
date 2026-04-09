# CLAUDE.md — Agent Instructions for Open Brain

This file helps AI coding tools (Claude Code, Codex, Cursor, etc.) work effectively in this repo.

## What This Repo Is

Open Brain is a persistent AI memory system — one self-hosted database (PostgreSQL + pgvector), one AI gateway (LiteLLM), one MCP protocol, any AI client. This repo contains the self-hosted Docker deployment (`deploy/`), plus the extensions, recipes, schemas, dashboards, and integrations that the community builds on top of the core Open Brain setup.

**License:** FSL-1.1-MIT. No commercial derivative works. Keep this in mind when generating code or suggesting dependencies.

## Repo Structure

```
deploy/         — Self-hosted Docker deployment (Node.js MCP server, PostgreSQL, Caddy).
extensions/     — Curated, ordered learning path (6 builds). Do NOT add without maintainer approval.
primitives/     — Reusable concept guides (must be referenced by 2+ extensions). Curated.
recipes/        — Standalone capability builds. Open for community contributions.
schemas/        — Database table extensions. Open.
dashboards/     — Frontend templates (Vercel/Netlify). Open.
integrations/   — MCP extensions, webhooks, capture sources. Open.
skills/         — Reusable AI client skills and prompt packs. Open.
docs/           — Setup guides, FAQ, companion prompts.
resources/      — Claude Skill, companion files.
```

Every contribution lives in its own subfolder under the right category and must include `README.md` + `metadata.json`.

## Architecture

The system runs as a Docker Compose stack:
- **PostgreSQL** (pgvector/pgvector:pg18) — stores thoughts with vector embeddings, extension tables
- **Node.js app** (Hono + MCP SDK) — serves MCP tools, Admin API, and Slack capture
- **Reverse proxy** — Caddy (included), Traefik, or Cloudflare for HTTPS
- **LiteLLM** (external) — OpenAI-compatible AI gateway for embeddings and metadata extraction

Multi-brain isolation: each user gets their own PostgreSQL schema (`brain_<slug>`), managed via the Admin API. The MCP server sets `search_path` per request based on the API key.

**Important**: The MCP endpoint (`/mcp`) uses the Node.js native `StreamableHTTPServerTransport` (not the web-standard version) and is handled by a raw `http.createServer` handler, bypassing Hono. This is required for SSE streaming to work correctly through reverse proxies and Cloudflare. All other routes (admin, slack, health) go through Hono.

Key deploy files:
- `deploy/docker-compose.yml` — service definitions
- `deploy/app/src/index.ts` — main entry point (raw HTTP for MCP, Hono for the rest)
- `deploy/app/src/mcp/tools/` — all MCP tool implementations
- `deploy/db/init/` — SQL init scripts (run automatically on first boot)

## Upstream Relationship

This is a fork of [NateBJones-Projects/OB1](https://github.com/NateBJones-Projects/OB1). The upstream uses **Supabase Edge Functions** for the MCP server and **OpenRouter** for AI. This fork replaces that with a **self-hosted Docker deployment** (`deploy/`) using Node.js + Hono, PostgreSQL (direct), LiteLLM, and Caddy.

### Key Differences

| Aspect | Upstream (Supabase) | This Fork (Docker) |
|--------|---------------------|---------------------|
| Database | Supabase-hosted PostgreSQL | Self-hosted PostgreSQL (pgvector container) |
| MCP server | Supabase Edge Functions (Deno) | Node.js app (Hono + MCP SDK) in `deploy/app/` |
| AI gateway | OpenRouter | LiteLLM (any OpenAI-compatible endpoint) |
| Multi-tenancy | Supabase RLS (`auth.uid()`) | Schema-per-brain isolation (`brain_<slug>`) |
| Reverse proxy | Supabase handles | Caddy / Traefik / Cloudflare |
| Auth | Supabase Auth + service_role key | Admin API key + per-brain API keys |

### What Merges Cleanly From Upstream

These directories contain additive content that does not conflict with `deploy/`:
- `skills/` — Entire directory (AI client skill packs)
- `recipes/<new-recipe>/` — New recipe subdirectories
- `dashboards/<new-dashboard>/` — New dashboard projects
- `integrations/<new-integration>/` — New integration sources

### What Conflicts (Needs Manual Reconciliation)

These files diverge because upstream references Supabase/OpenRouter while we reference Docker/LiteLLM:
- `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `SECURITY.md`
- `docs/` — Getting-started guide is entirely different
- `.github/workflows/` — CI references Supabase patterns
- Existing `extensions/*/README.md` and `recipes/*/README.md` — Upstream uses Supabase credential references

**Note:** New recipes/skills from upstream contain Supabase/OpenRouter references in their READMEs. These are accepted as-is from the community. Our Docker deployment uses `DATABASE_URL` and `LITELLM_API_KEY` instead of `SUPABASE_URL` and `OPENROUTER_API_KEY`.

### Checking for Upstream Updates

```bash
git fetch upstream
git log --oneline HEAD..upstream/main                    # new commits
git diff --stat HEAD..upstream/main -- skills/ recipes/  # new additive content
```

## Common Operations

### Create a new brain
```bash
curl -X POST https://<domain>/admin/brains \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"<name>","display_name":"<Display Name>"}'
```
Save the returned `api_key` — it is shown only once. The MCP URL is `https://<domain>/mcp?key=<api_key>`.

### Connect a brain to Claude Code
```bash
claude mcp add <name>-brain --transport http "https://<domain>/mcp?key=<api_key>"
```

### Connect a brain to Claude Desktop (Mac)
Add to `~/Library/Application Support/Claude/claude_desktop_config.json` under `mcpServers`:
```json
"<name>-brain": {
  "command": "npx",
  "args": ["mcp-remote", "https://<domain>/mcp?key=<api_key>"]
}
```
Restart Claude Desktop after editing.

### Install an extension on a brain
```bash
curl -X POST https://<domain>/admin/brains/<slug>/extensions/<name> \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```
Available extensions: `household`, `maintenance`, `calendar`, `meals`, `crm`, `jobhunt`.

### Map a Slack channel to a brain
```bash
curl -X POST https://<domain>/admin/brains/<slug>/slack \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"<SLACK_CHANNEL_ID>"}'
```

### List all brains
```bash
curl https://<domain>/admin/brains \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### Check server health
```bash
curl https://<domain>/health
```

### View logs (on the server)
```bash
docker compose logs -f app        # App logs
docker compose logs -f postgres   # Database logs
```

### Update the server
```bash
git pull && docker compose build app && docker compose up -d app
```

## Guard Rails

- **Never modify the core `thoughts` table structure.** Adding columns is fine; altering or dropping existing ones is not.
- **No credentials, API keys, or secrets in any file.** Use environment variables.
- **No binary blobs** over 1MB. No `.exe`, `.dmg`, `.zip`, `.tar.gz`.
- **No `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, or unqualified `DELETE FROM`** in SQL files.
- **MCP tools are served by the Node.js app** in `deploy/app/`. Extensions are registered dynamically based on which tables exist in the brain's schema. See `deploy/app/src/mcp/tools/registry.ts` for the extension registry.

## PR Standards

- **Title format:** `[category] Short description` (e.g., `[recipes] Email history import via Gmail API`)
- **Branch convention:** `contrib/<github-username>/<short-description>`
- **Commit prefixes:** `[category]` matching the contribution type
- Every PR must pass the automated review checks in `.github/workflows/ob1-review.yml` before human review
- See `CONTRIBUTING.md` for the full review process, metadata.json template, and README requirements

## Key Files

- `CONTRIBUTING.md` — Source of truth for contribution rules, metadata format, and the review process
- `.github/workflows/ob1-review.yml` — Automated PR review
- `.github/metadata.schema.json` — JSON schema for metadata.json validation
- `.github/PULL_REQUEST_TEMPLATE.md` — PR description template
- `LICENSE.md` — FSL-1.1-MIT terms
