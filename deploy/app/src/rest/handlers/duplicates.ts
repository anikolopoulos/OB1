import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';

const duplicatesParamsSchema = z.object({
  threshold: z.coerce.number().min(0.5).max(1.0).default(0.85),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  days: z.coerce.number().int().min(1).default(90),
});

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
  // Use LATERAL join so the inner ORDER BY ... LIMIT uses the HNSW index
  // per thought (O(n*k) with index) instead of a full cross-join (O(n^2) scan)
  const result = await brainQuery(
    c,
    `SELECT DISTINCT ON (LEAST(a.id, b.id), GREATEST(a.id, b.id))
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
       CROSS JOIN LATERAL (
         SELECT id, content, metadata, embedding, created_at
           FROM thoughts
          WHERE id != a.id
            AND embedding IS NOT NULL
            AND created_at >= now() - ($1 * interval '1 day')
          ORDER BY embedding <=> a.embedding
          LIMIT 5
       ) b
      WHERE a.embedding IS NOT NULL
        AND a.created_at >= now() - ($1 * interval '1 day')
        AND 1 - (a.embedding <=> b.embedding) >= $2
      ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id), similarity DESC`,
    [days, threshold],
  );

  // Apply offset/limit in JS (DISTINCT ON + ORDER BY similarity requires post-processing)
  const sorted = result.rows.sort((x: { similarity: number }, y: { similarity: number }) => y.similarity - x.similarity);
  const paged = sorted.slice(offset, offset + limit);

  return c.json({ pairs: paged, threshold, limit, offset });
}
