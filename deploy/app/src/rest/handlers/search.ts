import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';
import { getEmbedding } from '../../ai/embeddings.js';

const searchBodySchema = z.object({
  query: z.string().min(1),
  mode: z.enum(['semantic', 'text']),
  limit: z.number().int().min(1).max(100).default(25),
  page: z.number().int().min(1).default(1),
  exclude_restricted: z.boolean().default(true),
});

function isNotRestricted(r: Record<string, unknown>): boolean {
  const meta = r.metadata as Record<string, unknown> | null | undefined;
  const tier = meta?.sensitivity_tier;
  // If the field is absent, treat as 'standard' (allowed)
  return tier !== 'restricted';
}

// POST /api/search
export async function searchHandler(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = searchBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { query, mode, limit, page, exclude_restricted } = parsed.data;
  const offset = (page - 1) * limit;

  if (mode === 'semantic') {
    const embedding = await getEmbedding(query);

    // match_thoughts returns rows ordered by similarity descending.
    // Fetch enough rows to cover pagination after optional restricted filtering.
    const fetchCount = limit * page;

    const result = await brainQuery(
      c,
      `SELECT * FROM match_thoughts($1::vector, 0.3, $2, '{}'::jsonb)`,
      [JSON.stringify(embedding), fetchCount],
    );

    let rows = result.rows as Array<Record<string, unknown>>;

    if (exclude_restricted) {
      rows = rows.filter(isNotRestricted);
    }

    const total = rows.length;
    const pageRows = rows.slice(offset, offset + limit);
    const total_pages = Math.ceil(total / limit);

    const results = pageRows.map((r) => {
      const meta = r.metadata as Record<string, unknown> | null | undefined;
      return {
        id: r.id,
        content: r.content,
        metadata: r.metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
        similarity: r.similarity,
        type: meta?.type ?? null,
        source_type: meta?.source ?? 'unknown',
      };
    });

    return c.json({
      results,
      count: pageRows.length,
      total,
      page,
      per_page: limit,
      total_pages,
      mode,
    });
  }

  // Text mode — full-text search via tsvector
  const restrictedClause = exclude_restricted
    ? `AND COALESCE(metadata->>'sensitivity_tier', 'standard') != 'restricted'`
    : '';

  const countResult = await brainQuery(
    c,
    `SELECT count(*)::int AS total
       FROM thoughts
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        ${restrictedClause}`,
    [query],
  );

  const total: number = countResult.rows[0].total;
  const total_pages = Math.ceil(total / limit);

  const dataResult = await brainQuery(
    c,
    `SELECT id, content, metadata, created_at, updated_at,
            ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
       FROM thoughts
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        ${restrictedClause}
      ORDER BY rank DESC
      LIMIT $2 OFFSET $3`,
    [query, limit, offset],
  );

  const results = dataResult.rows.map((r: Record<string, unknown>) => {
    const meta = r.metadata as Record<string, unknown> | null | undefined;
    return {
      id: r.id,
      content: r.content,
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at,
      rank: r.rank,
      type: meta?.type ?? null,
      source_type: meta?.source ?? 'unknown',
    };
  });

  return c.json({
    results,
    count: results.length,
    total,
    page,
    per_page: limit,
    total_pages,
    mode,
  });
}
