import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';

// ── GET /api/thought/:id/reflection ──────────────────────────────────────────
export async function listReflections(c: Context): Promise<Response> {
  const id = c.req.param('id');

  // Verify the thought exists first
  const thoughtCheck = await brainQuery(
    c,
    `SELECT id FROM thoughts WHERE id = $1::uuid`,
    [id],
  );

  if (thoughtCheck.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  const result = await brainQuery(
    c,
    `SELECT id, thought_id, trigger_context, options, factors,
            conclusion, confidence, reflection_type, metadata, created_at, updated_at
       FROM reflections
      WHERE thought_id = $1::uuid
      ORDER BY created_at DESC`,
    [id],
  );

  return c.json({ reflections: result.rows });
}

// ── POST /api/thought/:id/reflection ─────────────────────────────────────────
const createReflectionSchema = z.object({
  trigger_context: z.string().optional(),
  options: z.array(z.object({ label: z.string() })).default([]),
  factors: z.array(z.object({ label: z.string(), weight: z.number() })).default([]),
  conclusion: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reflection_type: z.string().default('decision_trace'),
});

export async function createReflection(c: Context): Promise<Response> {
  const id = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = createReflectionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  // Verify the thought exists
  const thoughtCheck = await brainQuery(
    c,
    `SELECT id FROM thoughts WHERE id = $1::uuid`,
    [id],
  );

  if (thoughtCheck.rows.length === 0) {
    return c.json({ error: 'Thought not found' }, 404);
  }

  const {
    trigger_context = null,
    options,
    factors,
    conclusion = null,
    confidence = null,
    reflection_type,
  } = parsed.data;

  const result = await brainQuery(
    c,
    `INSERT INTO reflections
       (thought_id, trigger_context, options, factors, conclusion, confidence, reflection_type)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING *`,
    [
      id,
      trigger_context,
      JSON.stringify(options),
      JSON.stringify(factors),
      conclusion,
      confidence,
      reflection_type,
    ],
  );

  return c.json(result.rows[0], 201);
}
