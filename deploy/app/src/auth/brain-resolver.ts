import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';

export async function resolveBrain(
  apiKey: string,
): Promise<{ brainId: string; schemaName: string; slug: string; displayName: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const result = await pool.query(
    `SELECT b.id   AS brain_id,
            b.schema_name,
            b.slug,
            b.display_name
       FROM management.brain_keys k
       JOIN management.brains b ON b.id = k.brain_id
      WHERE k.key_hash = $1
        AND k.revoked_at IS NULL
        AND b.deleted_at IS NULL
      LIMIT 1`,
    [keyHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Fire-and-forget: update last_used_at on the key
  pool
    .query(
      'UPDATE management.brain_keys SET last_used_at = now() WHERE key_hash = $1',
      [keyHash],
    )
    .catch(() => {
      // Intentionally swallowed — non-critical update
    });

  return {
    brainId: row.brain_id,
    schemaName: row.schema_name,
    slug: row.slug,
    displayName: row.display_name ?? row.slug,
  };
}
