# Extension Generator Spec

This document is a machine-readable specification for generating new Open Brain extensions. An AI agent given this spec and a description of the desired extension should be able to produce all required files in a single pass.

## Required Output Files

Every extension produces exactly 5 files in `extensions/{extension-slug}/`:

| File | Purpose |
|------|---------|
| `README.md` | Human-readable setup guide (follows template below) |
| `metadata.json` | Machine-readable metadata (follows schema below) |
| `schema.sql` | PostgreSQL tables, indexes, RLS policies |
| `tools.ts` | MCP tool definitions (registered in `deploy/app/src/mcp/tools/`) |

---

## File 1: metadata.json

Must validate against `/.github/metadata.schema.json`. Required fields:

```json
{
  "name": "Human-Readable Extension Name",
  "description": "One sentence. What capability does this add?",
  "category": "extensions",
  "author": {
    "name": "Author Name",
    "github": "github-username"
  },
  "version": "1.0.0",
  "requires": {
    "open_brain": true,
    "services": [],
    "tools": ["Docker Compose"]
  },
  "requires_primitives": ["deploy-edge-function", "remote-mcp"],
  "learning_order": null,
  "tags": ["at-least-one-tag"],
  "difficulty": "beginner | intermediate | advanced",
  "estimated_time": "30 minutes"
}
```

Rules:
- `requires_primitives` always includes `remote-mcp`. Add others (e.g., `rls`, `shared-mcp`) only if the extension teaches those concepts.
- `learning_order` is only set for curated learning path extensions (1-6). Community extensions omit it.
- `services` lists external APIs beyond the core stack (e.g., `["Gmail API"]`).
- `tags` should include the extension's domain and difficulty-related terms.

---

## File 2: schema.sql

PostgreSQL DDL that runs via `psql` or `docker compose exec postgres psql`. Must follow these rules:

1. **Every table must have:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `created_at TIMESTAMPTZ DEFAULT now() NOT NULL`

2. **Use `CREATE TABLE IF NOT EXISTS`** — safe to re-run.

3. **Include indexes** for columns that will be queried frequently.

4. **Schema-per-brain isolation:** In the self-hosted architecture, each brain gets its own PostgreSQL schema. Tables are created within the brain's schema automatically. RLS can optionally be added within a brain for finer-grained control, but is not required for multi-tenancy.

5. **Never modify the core `thoughts` table.** Adding new tables is fine. Referencing `thoughts` via foreign key is fine. Altering or dropping `thoughts` columns is not.

6. **No `DROP TABLE`, `TRUNCATE`, or unqualified `DELETE FROM`.**

7. **Use JSONB for flexible metadata fields** where the structure might vary (e.g., `details JSONB DEFAULT '{}'`).

8. **Add update triggers** if the table has `updated_at`:

   ```sql
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = now();
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```

---

## File 3: tools.ts

Extension tools are registered in the Node.js MCP server at `deploy/app/src/mcp/tools/`. Each extension adds a tools file that exports its tool definitions. The MCP server framework handles authentication, database connections, and transport automatically.

```typescript
// deploy/app/src/mcp/tools/extension-slug.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Pool } from "pg";

export function registerExtensionTools(server: McpServer, pool: Pool) {
  // Register tools here using server.registerTool()
}
```

### Tool Registration Pattern

Every tool follows this pattern:

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Human-Readable Tool Name",
    description: "When should the AI use this tool? Be specific about triggers.",
    inputSchema: {
      param_name: z.string().describe("What this parameter is for"),
      optional_param: z.number().optional().default(10),
    },
  },
  async ({ param_name, optional_param }) => {
    try {
      // PostgreSQL query here
      const result = await pool.query(
        "SELECT * FROM table_name WHERE id = $1",
        [param_name]
      );

      return {
        content: [{ type: "text" as const, text: `Result: ${JSON.stringify(result.rows)}` }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);
```

### Tool Design Rules

1. **Every tool must return `{ content: [{ type: "text" as const, text: string }] }`**. Never return raw strings.
2. **Every tool must have a try/catch** that returns `isError: true` on failure.
3. **Tool descriptions should describe WHEN to use the tool**, not what it does technically. The AI reads these to decide which tool to call.
4. **Use Zod for input validation.** Every parameter needs `.describe()` for the AI to understand it.
5. **Minimum tools per extension:** one for adding data, one for retrieving/searching data.
6. **Schema-per-brain isolation** handles multi-tenancy automatically. Each brain operates in its own PostgreSQL schema, so no user_id filtering is needed at the query level.

### Extensions That Need LLM Calls

If the extension uses embeddings or LLM extraction (like the core brain), use the LiteLLM instance configured in your Docker stack. The `LITELLM_URL` and `LITELLM_API_KEY` environment variables are available to the Node.js app automatically.

---

## File 4: README.md

Must follow the template at `extensions/_template/README.md`. Key sections:

### Deployment

Extensions are deployed as part of the Docker Compose stack. New tools are registered in `deploy/app/src/mcp/tools/` and picked up on restart (`docker compose up -d`).

### SQL Setup

Point users to run SQL via `psql` or `docker compose exec postgres psql`:

```markdown
Run the SQL in `schema.sql` against your database:
`docker compose exec postgres psql -U postgres -d open_brain -f /path/to/schema.sql`
Or copy-paste into your database client.
```

### Test Prompts

Include 3-5 example prompts a user can try immediately after setup. These should demonstrate the core tools and produce visible results.

---

## Naming Conventions

| Thing | Pattern | Example |
|-------|---------|---------|
| Directory | `extensions/{kebab-case-name}/` | `extensions/household-knowledge/` |
| Tools file | `{kebab-case-name}.ts` | `household-knowledge.ts` |
| MCP server name | `{kebab-case-name}` | `household-knowledge` |
| Table names | `{snake_case}` | `household_items`, `household_vendors` |
| Tool names | `{snake_case}` | `add_household_item`, `search_items` |
| Connector name | Title Case | `Household Knowledge` |

---

## Validation Checklist

Before submitting, verify:

- [ ] `metadata.json` validates against `/.github/metadata.schema.json`
- [ ] `schema.sql` uses `IF NOT EXISTS`, includes indexes
- [ ] `schema.sql` does NOT modify the `thoughts` table
- [ ] `tools.ts` follows the tool registration pattern
- [ ] `tools.ts` tools return `{ content: [{ type: "text" as const, text }] }` format
- [ ] `tools.ts` tools have try/catch with `isError: true` error handling
- [ ] `README.md` includes test prompts
- [ ] No credentials, API keys, or secrets in any file
- [ ] No binary files over 1MB
- [ ] Directory name matches the download path in the README deployment table

---

## Example Prompt for AI Agent

> Create a new Open Brain extension called "Reading List" that tracks books, articles, and papers. Users should be able to add items with title, author, URL, status (to-read, reading, finished), notes, and a rating. Include tools for adding items, searching by title/author/status, and getting stats on reading habits. Follow the AGENT_SPEC.md in extensions/_template/.

This prompt, combined with this spec, should produce all 5 files correctly formatted and ready for a PR.
