import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';

const statsParamsSchema = z.object({
  days: z.coerce.number().int().min(1).optional(),
  exclude_restricted: z.enum(['true', 'false']).default('true'),
});

// GET /api/stats
export async function statsHandler(c: Context): Promise<Response> {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = statsParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const { days, exclude_restricted } = parsed.data;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 0;

  if (exclude_restricted === 'true') {
    conditions.push(`COALESCE(metadata->>'sensitivity_tier', 'standard') != 'restricted'`);
  }

  if (days !== undefined) {
    p++;
    conditions.push(`created_at >= now() - $${p} * interval '1 day'`);
    params.push(days);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Total count
  const countResult = await brainQuery(
    c,
    `SELECT count(*)::int AS total FROM thoughts ${whereClause}`,
    params,
  );
  const total_thoughts: number = countResult.rows[0].total;

  // 2. Type breakdown
  const typeResult = await brainQuery(
    c,
    `SELECT metadata->>'type' AS type, count(*)::int AS count
       FROM thoughts
     ${whereClause}
     GROUP BY 1`,
    params,
  );

  const types: Record<string, number> = {};
  for (const row of typeResult.rows as Array<{ type: string | null; count: number }>) {
    const key = row.type ?? 'unknown';
    types[key] = row.count;
  }

  // 3. Top topics — unnest the topics array from metadata JSONB
  const topicsResult = await brainQuery(
    c,
    `SELECT topic, count(*)::int AS count
       FROM thoughts,
            jsonb_array_elements_text(COALESCE(metadata->'topics', '[]'::jsonb)) AS topic
     ${whereClause}
     GROUP BY 1
     ORDER BY 2 DESC
     LIMIT 15`,
    params,
  );

  const top_topics = (topicsResult.rows as Array<{ topic: string; count: number }>).map((r) => ({
    topic: r.topic,
    count: r.count,
  }));

  return c.json({
    total_thoughts,
    window_days: days ?? 'all',
    types,
    top_topics,
  });
}
