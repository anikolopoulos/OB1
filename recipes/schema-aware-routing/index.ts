/**
 * Schema-Aware Routing Pattern for Open Brain (OB1)
 *
 * This module demonstrates a pattern where an LLM extracts structured metadata
 * from unstructured text, then routes that data to the correct database tables
 * based on the extracted schema fields.
 *
 * Flow:
 *   Raw text → LLM metadata extraction → Schema-aware routing → Multi-table writes
 *
 * Tables written to:
 *   - thoughts      (always — the raw capture)
 *   - people        (if people are mentioned — with fuzzy match / create / link)
 *   - interactions  (one per person found — links person ↔ thought)
 *   - action_items  (only if the speaker commits to first-person action)
 *
 * Setup:
 *   npm install pg
 *   npm install --save-dev @types/pg
 *
 * Environment variables required:
 *   DATABASE_URL      — PostgreSQL connection string
 *                       e.g. postgresql://ob1:password@localhost:5432/ob1
 *   LITELLM_BASE_URL  — LiteLLM base URL (default: http://localhost:4000/v1)
 *   LITELLM_API_KEY   — LiteLLM API key
 *   EMBEDDING_MODEL   — Embedding model name (default: text-embedding-3-small)
 *   LLM_MODEL         — Chat model name (default: gpt-4o-mini)
 */

import { Pool, PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedMetadata {
  people: PersonMention[];
  action_items: string[];
  dates_mentioned: string[];
  topics: string[];
  type: "task" | "observation" | "idea" | "reference" | "person_note";
  domain: "work" | "family" | "personal" | "health" | "finance" | "home";
}

interface PersonMention {
  name: string;
  relationship_type: string | null;
  role: string | null;
}

interface PersonRow {
  id: string;
  name: string;
  aliases: string[] | null;
  relationship_type: string | null;
  role: string | null;
}

interface PersonResult {
  name: string;
  id: string;
  action: "found" | "created" | "pending";
}

interface WriteResult {
  table: string;
  success: boolean;
  error?: string;
  details?: string;
}

interface RoutingOutcome {
  thoughtId: string | null;
  writes: WriteResult[];
  people: PersonResult[];
}

// ---------------------------------------------------------------------------
// Database pool
// ---------------------------------------------------------------------------
// Create a single pool and reuse it across calls. The DATABASE_URL environment
// variable must be set before importing this module.

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// 1. LLM Metadata Extraction
// ---------------------------------------------------------------------------
// The LLM prompt is the heart of the routing system. It defines the schema
// that downstream routing decisions depend on. Every field here maps to a
// table or a column somewhere in the database.

const EXTRACTION_SYSTEM_PROMPT = `Extract metadata from a captured thought. Return JSON with:
- "people": array of objects for each person mentioned, each with:
  - "name": the person's name
  - "relationship_type": broad category — one of "family", "friend", "colleague",
    "student", "manager", "professional_contact", "contractor", "service_provider", "other"
  - "role": specific title or role (e.g., "daughter", "principal", "accountant")
- "action_items": array of to-dos ONLY if the speaker is explicitly committing to
  do something themselves using first-person intent ("I need to", "I should",
  "I have to", "remind me to"). If someone ELSE wants something, leave this empty.
- "dates_mentioned": array of dates in YYYY-MM-DD format (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": use "task" ONLY for first-person commitments. Everything else is
  "observation", "idea", "reference", or "person_note".
- "domain": one of "work", "family", "personal", "health", "finance", "home"

Only extract what is explicitly there.`;

/**
 * Call LiteLLM to extract structured metadata from raw text.
 * Sends EXTRACTION_SYSTEM_PROMPT as the system message and the input text
 * as the user message, requesting JSON response format.
 */
async function extractMetadata(text: string): Promise<ExtractedMetadata> {
  const baseUrl = process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LITELLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LiteLLM chat error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return JSON.parse(json.choices[0].message.content) as ExtractedMetadata;
}

/**
 * Generate an embedding vector for the input text via LiteLLM.
 * Used for semantic search across thoughts and interactions.
 */
async function getEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1";
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LITELLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    throw new Error(`LiteLLM embedding error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return json.data[0].embedding as number[];
}

// ---------------------------------------------------------------------------
// 2. People Routing — Find, Fuzzy-Match, or Create
// ---------------------------------------------------------------------------

/**
 * Fuzzy name matching — only triggers on first-name similarity.
 * Same last name alone is NOT considered a match.
 */
function namesAreSimilar(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  if (n1 === n2) return true;

  const first1 = n1.split(/\s+/)[0];
  const first2 = n2.split(/\s+/)[0];

  // First names identical and at least 3 chars
  if (first1 === first2 && first1.length >= 3) return true;

  // One first name contains the other (e.g. "Rob" ↔ "Robert")
  if (first1.length >= 3 && first2.length >= 3) {
    if (first1.includes(first2) || first2.includes(first1)) return true;
  }

  return false;
}

/**
 * Three-pass person resolution:
 *   Pass 1 — Exact match on name or aliases → link to existing person
 *   Pass 2 — Fuzzy match on first name → flag for human confirmation
 *   Pass 3 — First-name collision detection → flag for human confirmation
 *   Default — No match → create new person
 */
async function findOrCreatePerson(
  client: PoolClient,
  person: PersonMention,
): Promise<PersonResult> {
  const { rows: allPeople } = await client.query<PersonRow>(
    `SELECT id, name, aliases, relationship_type, role
     FROM people
     WHERE status = 'active'`,
  );

  const nameLower = person.name.toLowerCase().trim();

  // --- Pass 1: Exact match by name or alias ---
  for (const existing of allPeople) {
    const nameMatch = existing.name.toLowerCase().trim() === nameLower;
    const aliasMatch = (existing.aliases ?? []).some(
      (a) => a.toLowerCase().trim() === nameLower,
    );

    if (nameMatch || aliasMatch) {
      // Backfill missing metadata on the existing record
      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (person.role && !existing.role) {
        values.push(person.role);
        setClauses.push(`role = $${values.length}`);
      }
      if (person.relationship_type && !existing.relationship_type) {
        values.push(person.relationship_type);
        setClauses.push(`relationship_type = $${values.length}`);
      }

      if (setClauses.length > 0) {
        setClauses.push("updated_at = now()");
        values.push(existing.id);
        await client.query(
          `UPDATE people SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
          values,
        );
      }

      return { name: person.name, id: existing.id, action: "found" };
    }
  }

  // --- Pass 2: Fuzzy match → needs human confirmation ---
  for (const existing of allPeople) {
    if (namesAreSimilar(person.name, existing.name)) {
      // In production, post a confirmation request to your inbox/queue.
      // e.g. "New person 'Mike S.' looks like 'Mike Smith' — same person?"
      console.log(
        `Fuzzy match: "${person.name}" ≈ "${existing.name}" — needs confirmation`,
      );
      return { name: person.name, id: "", action: "pending" };
    }
  }

  // --- Pass 3: First-name collision detection ---
  const newFirst = nameLower.split(/\s+/)[0];
  if (newFirst.length >= 3) {
    for (const existing of allPeople) {
      const existingFirst = existing.name.toLowerCase().trim().split(/\s+/)[0];
      if (newFirst === existingFirst && nameLower !== existing.name.toLowerCase().trim()) {
        console.log(
          `First-name collision: "${person.name}" vs "${existing.name}" — needs confirmation`,
        );
        return { name: person.name, id: "", action: "pending" };
      }
    }
  }

  // --- Default: Create new person ---
  const cols = ["name", "status"];
  const vals: unknown[] = [person.name, "active"];

  if (person.relationship_type) {
    cols.push("relationship_type");
    vals.push(person.relationship_type);
  }
  if (person.role) {
    cols.push("role");
    vals.push(person.role);
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO people (${cols.join(", ")})
     VALUES (${placeholders})
     RETURNING id`,
    vals,
  );

  return { name: person.name, id: rows[0]?.id ?? "", action: "created" };
}

// ---------------------------------------------------------------------------
// 3. The Main Router — Schema-Aware Multi-Table Writes
// ---------------------------------------------------------------------------

/**
 * processThought() is the core routing function.
 *
 * It takes raw text, extracts structured metadata via LLM, then routes
 * each piece of data to the correct table based on the schema fields.
 *
 * Routing rules:
 *   1. ALWAYS write to `thoughts` (the raw capture — never lost)
 *   2. For each person in metadata.people → resolve via findOrCreatePerson,
 *      then write an `interactions` record linking person ↔ thought
 *   3. For each item in metadata.action_items → write to `action_items`
 *      (only populated when speaker uses first-person intent)
 */
async function processThought(
  text: string,
  source: string = "api",
): Promise<RoutingOutcome> {
  const writes: WriteResult[] = [];
  const people: PersonResult[] = [];

  // Step 1: Extract metadata and embedding in parallel
  const [embedding, metadata] = await Promise.all([
    getEmbedding(text),
    extractMetadata(text),
  ]);

  const domain = metadata.domain || "personal";
  // pgvector expects the embedding as a PostgreSQL array literal: '[0.1,0.2,...]'
  const embeddingLiteral = `[${embedding.join(",")}]`;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // -----------------------------------------------------------------------
    // Route 1: THOUGHTS table (always written)
    // -----------------------------------------------------------------------
    let thoughtId: string | null = null;

    try {
      const enrichedMetadata = { ...metadata, domain, source, status: "active" };
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO thoughts (content, embedding, metadata)
         VALUES ($1, $2::vector, $3::jsonb)
         RETURNING id`,
        [text, embeddingLiteral, JSON.stringify(enrichedMetadata)],
      );
      thoughtId = rows[0]?.id ?? null;
      writes.push({ table: "thoughts", success: true });
    } catch (err) {
      writes.push({ table: "thoughts", success: false, error: String(err) });
    }

    // -----------------------------------------------------------------------
    // Route 2: PEOPLE table (find/create) + INTERACTIONS table (link)
    // -----------------------------------------------------------------------
    for (const personMention of metadata.people) {
      const result = await findOrCreatePerson(client, personMention);
      people.push(result);

      if (result.action === "created") {
        writes.push({ table: "people", success: true, details: `Created: ${result.name}` });
      }

      // Write an interaction record for every resolved person
      if (result.id) {
        try {
          await client.query(
            `INSERT INTO interactions (person_id, note, source, embedding)
             VALUES ($1, $2, $3, $4::vector)`,
            [result.id, text, source, embeddingLiteral],
          );
          writes.push({
            table: "interactions",
            success: true,
            details: `For: ${result.name}`,
          });
        } catch (err) {
          writes.push({
            table: "interactions",
            success: false,
            error: String(err),
            details: `For: ${result.name}`,
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Route 3: ACTION_ITEMS table (only first-person commitments)
    // -----------------------------------------------------------------------
    for (const actionItem of metadata.action_items) {
      const linkedPersonId = people.find((p) => p.id)?.id ?? null;

      try {
        await client.query(
          `INSERT INTO action_items (title, domain, source, status, linked_person_id)
           VALUES ($1, $2, $3, 'open', $4)`,
          [actionItem, domain, source, linkedPersonId],
        );
        writes.push({
          table: "action_items",
          success: true,
          details: actionItem.substring(0, 50),
        });
      } catch (err) {
        writes.push({
          table: "action_items",
          success: false,
          error: String(err),
          details: actionItem.substring(0, 50),
        });
      }
    }

    await client.query("COMMIT");
    return { thoughtId, writes, people };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  processThought,
  findOrCreatePerson,
  extractMetadata,
  namesAreSimilar,
  EXTRACTION_SYSTEM_PROMPT,
};

export type {
  ExtractedMetadata,
  PersonMention,
  PersonResult,
  WriteResult,
  RoutingOutcome,
};
