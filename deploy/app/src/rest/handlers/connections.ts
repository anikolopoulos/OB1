import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';

const connectionsParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  exclude_restricted: z.enum(['true', 'false']).default('true'),
});

// GET /api/thought/:id/connections
export async function connectionsHandler(c: Context): Promise<Response> {
  const id = c.req.param('id');

  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = connectionsParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const { limit, exclude_restricted } = parsed.data;

  // 1. Fetch the source thought's embedding
  const embResult = await brainQuery(
    c,
    `SELECT embedding FROM thoughts WHERE id = $1::uuid`,
    [id],
  );

  if (embResult.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  const { embedding } = embResult.rows[0] as { embedding: string | null };

  if (!embedding) {
    return c.json({ connections: [] });
  }

  const restrictedClause =
    exclude_restricted === 'true'
      ? `AND COALESCE(metadata->>'sensitivity_tier', 'standard') != 'restricted'`
      : '';

  // 2. Find similar thoughts using cosine distance
  const result = await brainQuery(
    c,
    `SELECT id,
            content,
            content_fingerprint,
            metadata->>'type'                                     AS type,
            COALESCE(metadata->>'source', 'unknown')             AS source_type,
            COALESCE((metadata->>'importance')::int, 5)          AS importance,
            COALESCE((metadata->>'quality_score')::int, 0)       AS quality_score,
            COALESCE(metadata->>'sensitivity_tier', 'standard')  AS sensitivity_tier,
            metadata,
            created_at,
            updated_at,
            1 - (embedding <=> $1) AS similarity
       FROM thoughts
      WHERE id != $2::uuid
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1) >= 0.4
        ${restrictedClause}
      ORDER BY embedding <=> $1
      LIMIT $3`,
    [embedding, id, limit],
  );

  return c.json({ connections: result.rows });
}
