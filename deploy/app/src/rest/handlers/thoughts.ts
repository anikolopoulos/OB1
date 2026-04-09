import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';
import { getEmbedding } from '../../ai/embeddings.js';
import { extractMetadata } from '../../ai/metadata.js';

// Shared SELECT projection — extracts flat fields from the metadata JSONB column
const THOUGHT_SELECT = `
  id,
  content,
  content_fingerprint,
  metadata->>'type'                                          AS type,
  COALESCE(metadata->>'source', 'unknown')                  AS source_type,
  COALESCE((metadata->>'importance')::int, 5)               AS importance,
  COALESCE((metadata->>'quality_score')::int, 0)            AS quality_score,
  COALESCE(metadata->>'sensitivity_tier', 'standard')       AS sensitivity_tier,
  metadata,
  created_at,
  updated_at
`;

// ── List query params schema ──────────────────────────────────────────────────
const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  type: z.string().optional(),
  source_type: z.string().optional(),
  importance_min: z.coerce.number().int().optional(),
  quality_score_max: z.coerce.number().int().optional(),
  sort: z.enum(['created_at', 'updated_at', 'importance', 'quality_score']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  exclude_restricted: z.enum(['true', 'false']).default('true'),
});

// ── GET /api/thoughts ─────────────────────────────────────────────────────────
export async function listThoughts(c: Context): Promise<Response> {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = listParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const {
    page,
    per_page,
    type,
    source_type,
    importance_min,
    quality_score_max,
    sort,
    order,
    exclude_restricted,
  } = parsed.data;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 0;

  if (type) {
    p++;
    conditions.push(`metadata @> $${p}::jsonb`);
    params.push(JSON.stringify({ type }));
  }

  if (source_type) {
    p++;
    conditions.push(`metadata @> $${p}::jsonb`);
    params.push(JSON.stringify({ source: source_type }));
  }

  if (importance_min !== undefined) {
    p++;
    conditions.push(`COALESCE((metadata->>'importance')::int, 5) >= $${p}`);
    params.push(importance_min);
  }

  if (quality_score_max !== undefined) {
    p++;
    conditions.push(`COALESCE((metadata->>'quality_score')::int, 0) <= $${p}`);
    params.push(quality_score_max);
  }

  if (exclude_restricted === 'true') {
    conditions.push(`COALESCE(metadata->>'sensitivity_tier', 'standard') != 'restricted'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort column mapping — computed fields need COALESCE expressions
  const sortExpr =
    sort === 'importance'
      ? `COALESCE((metadata->>'importance')::int, 5)`
      : sort === 'quality_score'
        ? `COALESCE((metadata->>'quality_score')::int, 0)`
        : sort;

  const orderDir = order.toUpperCase();

  // COUNT query (same params as the filter conditions above)
  const countResult = await brainQuery(
    c,
    `SELECT count(*)::int AS total FROM thoughts ${whereClause}`,
    params,
  );
  const total: number = countResult.rows[0].total;

  // Append LIMIT / OFFSET params for the data query
  p++;
  const limitParam = p;
  params.push(per_page);
  p++;
  const offsetParam = p;
  params.push((page - 1) * per_page);

  const dataResult = await brainQuery(
    c,
    `SELECT ${THOUGHT_SELECT}
       FROM thoughts
     ${whereClause}
     ORDER BY ${sortExpr} ${orderDir}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  );

  return c.json({
    data: dataResult.rows,
    total,
    page,
    per_page,
  });
}

// ── GET /api/thought/:id ──────────────────────────────────────────────────────
const getParamsSchema = z.object({
  exclude_restricted: z.enum(['true', 'false']).default('true'),
});

export async function getThought(c: Context): Promise<Response> {
  const id = c.req.param('id');

  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const parsed = getParamsSchema.safeParse(raw);
  const excludeRestricted = parsed.success ? parsed.data.exclude_restricted === 'true' : true;

  const conditions = ['id = $1::uuid'];
  if (excludeRestricted) {
    conditions.push(`COALESCE(metadata->>'sensitivity_tier', 'standard') != 'restricted'`);
  }

  const result = await brainQuery(
    c,
    `SELECT ${THOUGHT_SELECT}
       FROM thoughts
      WHERE ${conditions.join(' AND ')}`,
    [id],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  return c.json(result.rows[0]);
}

// ── PUT /api/thought/:id ──────────────────────────────────────────────────────
const updateBodySchema = z
  .object({
    content: z.string().min(1).optional(),
    type: z.string().optional(),
    importance: z.number().int().min(1).max(10).optional(),
  })
  .refine(
    (d) => d.content !== undefined || d.type !== undefined || d.importance !== undefined,
    { message: 'At least one of content, type, or importance must be provided' },
  );

export async function updateThought(c: Context): Promise<Response> {
  const id = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { content, type, importance } = parsed.data;

  // Start with explicit manual overrides — they must win over AI extraction
  const manualOverrides: Record<string, unknown> = {};
  if (type !== undefined) manualOverrides.type = type;
  if (importance !== undefined) manualOverrides.importance = importance;

  // Build the final JSONB patch: AI extraction as base, manual values on top
  let metaPatch: Record<string, unknown> = { ...manualOverrides };
  let newEmbedding: number[] | null = null;

  if (content !== undefined) {
    const [embedding, extracted] = await Promise.all([
      getEmbedding(content),
      extractMetadata(content),
    ]);
    newEmbedding = embedding;
    // Spread order: AI values first, then manual overrides win
    metaPatch = { ...(extracted as Record<string, unknown>), ...manualOverrides };
  }

  const embeddingParam = newEmbedding !== null ? JSON.stringify(newEmbedding) : null;

  const result = await brainQuery(
    c,
    `UPDATE thoughts
        SET content    = COALESCE($2, content),
            embedding  = COALESCE($3::vector, embedding),
            metadata   = metadata || $4::jsonb,
            updated_at = now()
      WHERE id = $1::uuid
  RETURNING id`,
    [id, content ?? null, embeddingParam, JSON.stringify(metaPatch)],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  return c.json({ id: result.rows[0].id, action: 'updated', message: 'Thought updated' });
}

// ── DELETE /api/thought/:id ───────────────────────────────────────────────────
export async function deleteThought(c: Context): Promise<Response> {
  const id = c.req.param('id');

  const result = await brainQuery(
    c,
    `DELETE FROM thoughts WHERE id = $1::uuid RETURNING id`,
    [id],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  return new Response(null, { status: 204 });
}
