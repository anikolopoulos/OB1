import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';

const duplicatesParamsSchema = z.object({
  threshold: z.coerce.number().min(0.5).max(1.0).default(0.85),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  days: z.coerce.number().int().min(1).default(90),
});

interface DuplicatePair {
  thought_id_a: string;
  thought_id_b: string;
  similarity: number;
  content_a: string;
  content_b: string;
  type_a: string;
  type_b: string;
  quality_a: number;
  quality_b: number;
  created_a: string;
  created_b: string;
}

// GET /api/duplicates
//
// Uses a self-join with cosine similarity to find near-duplicate thought pairs
// within the requested time window. The HNSW index is used implicitly via the
// <=> operator. For datasets up to a few thousand thoughts this is instant;
// at very large scales (100k+) a per-thought KNN iteration would be faster.
export async function duplicatesHandler(c: Context): Promise<Response> {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = duplicatesParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const { threshold, limit, offset, days } = parsed.data;

  // Self-join: compare every thought against every other thought in the window,
  // keeping only the canonical pair (a.id < b.id) to avoid (A,B) + (B,A) dupes.
  const result = await brainQuery(
    c,
    `SELECT
        a.id                                                      AS thought_id_a,
        b.id                                                      AS thought_id_b,
        1 - (a.embedding <=> b.embedding)                        AS similarity,
        a.content                                                 AS content_a,
        b.content                                                 AS content_b,
        COALESCE(a.metadata->>'type', 'observation')             AS type_a,
        COALESCE(b.metadata->>'type', 'observation')             AS type_b,
        COALESCE((a.metadata->>'quality_score')::int, 0)        AS quality_a,
        COALESCE((b.metadata->>'quality_score')::int, 0)        AS quality_b,
        a.created_at                                              AS created_a,
        b.created_at                                              AS created_b
       FROM thoughts a
       JOIN thoughts b ON a.id < b.id
      WHERE a.embedding IS NOT NULL
        AND b.embedding IS NOT NULL
        AND a.created_at >= now() - ($1 * interval '1 day')
        AND b.created_at >= now() - ($1 * interval '1 day')
        AND 1 - (a.embedding <=> b.embedding) >= $2
      ORDER BY similarity DESC
      LIMIT $3 OFFSET $4`,
    [days, threshold, limit, offset],
  );

  const pairs = result.rows as DuplicatePair[];

  return c.json({ pairs, threshold, limit, offset });
}
