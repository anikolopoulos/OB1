import { randomBytes, createHash } from 'node:crypto';
import { pool } from '../../db/pool.js';

/**
 * Look up a non-deleted brain by slug.
 * Always selects all management columns to avoid SQL injection via column interpolation.
 * Returns the first matching row, or `null` if not found.
 */
export async function findBrainBySlug(
  slug: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `SELECT id, slug, display_name, schema_name, created_at
       FROM management.brains
      WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  return rows[0] ?? null;
}

/** Generate a new `ob1_*` API key and its SHA-256 hash. */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `ob1_${randomBytes(16).toString('hex')}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, 12);
  return { plaintext, hash, prefix };
}
