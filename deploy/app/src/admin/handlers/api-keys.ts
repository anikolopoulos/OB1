import type { Context } from 'hono';
import { pool } from '../../db/pool.js';
import { findBrainBySlug, generateApiKey } from './shared.js';

// ── POST /admin/brains/:slug/api-keys ─────────────────────────────────────────
export async function createApiKey(c: Context): Promise<Response> {
  const body: { label?: string } = await c.req.json().catch(() => ({}));
  const label = body.label ?? null;

  const brain = await findBrainBySlug(c.req.param('slug')!);

  if (!brain) {
    return c.json({ error: 'Brain not found' }, 404);
  }

  const key = generateApiKey();

  const result = await pool.query(
    `INSERT INTO management.brain_keys (brain_id, key_hash, key_prefix, label)
     VALUES ($1, $2, $3, $4)
     RETURNING id, key_prefix, label, created_at`,
    [brain.id, key.hash, key.prefix, label],
  );

  return c.json(
    {
      id: result.rows[0].id,
      api_key: key.plaintext,
      prefix: result.rows[0].key_prefix,
      label: result.rows[0].label,
      created_at: result.rows[0].created_at,
    },
    201,
  );
}

// ── DELETE /admin/brains/:slug/api-keys/:id ───────────────────────────────────
export async function revokeApiKey(c: Context): Promise<Response> {
  const slug = c.req.param('slug')!;
  const keyId = c.req.param('id')!;

  // Verify brain exists and key belongs to it
  const result = await pool.query(
    `UPDATE management.brain_keys k
        SET revoked_at = now()
       FROM management.brains b
      WHERE k.id = $1
        AND k.brain_id = b.id
        AND b.slug = $2
        AND b.deleted_at IS NULL
        AND k.revoked_at IS NULL
      RETURNING k.id`,
    [keyId, slug],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'API key not found or already revoked' }, 404);
  }

  return c.json({ revoked: true });
}
