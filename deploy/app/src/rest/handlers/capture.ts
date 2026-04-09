import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';
import { getEmbedding } from '../../ai/embeddings.js';
import { extractMetadata } from '../../ai/metadata.js';

const captureBodySchema = z.object({
  content: z.string().min(1).max(50000),
});

// POST /api/capture
export async function captureHandler(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = captureBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { content } = parsed.data;

  const [embedding, metadata] = await Promise.all([
    getEmbedding(content),
    extractMetadata(content),
  ]);

  const result = await brainQuery(
    c,
    `SELECT * FROM upsert_thought($1, $2::vector, $3::jsonb)`,
    [content, JSON.stringify(embedding), JSON.stringify({ ...metadata, source: 'api' })],
  );

  if (!result.rows || result.rows.length === 0) {
    return c.json({ error: 'Failed to capture thought' }, 500);
  }

  const row = result.rows[0] as { id: string; is_new: boolean };
  const meta = metadata as Record<string, unknown>;

  return c.json(
    {
      thought_id: row.id,
      action: row.is_new ? 'create' : 'update',
      type: meta.type ?? 'observation',
      message: row.is_new
        ? `Captured as ${meta.type ?? 'thought'}`
        : 'Updated existing thought (duplicate content)',
    },
    row.is_new ? 201 : 200,
  );
}
