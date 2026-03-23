import type { Context } from 'hono';
import format from 'pg-format';
import { pool } from '../../db/pool.js';
import { findBrainBySlug, generateApiKey } from './shared.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

// ── POST /admin/brains ────────────────────────────────────────────────────────
export async function createBrain(c: Context): Promise<Response> {
  const body = await c.req.json<{ slug?: string; display_name?: string }>();

  const { slug, display_name } = body;

  if (!slug || !display_name) {
    return c.json({ error: 'slug and display_name are required' }, 400);
  }

  if (!SLUG_RE.test(slug)) {
    return c.json(
      {
        error:
          'slug must be 3-50 chars, lowercase alphanumeric + hyphens, cannot start/end with hyphen',
      },
      400,
    );
  }

  const schemaName = `brain_${slug.replace(/-/g, '_')}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const brainResult = await client.query(
      `INSERT INTO management.brains (slug, schema_name, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, slug, schema_name, display_name, created_at`,
      [slug, schemaName, display_name],
    );
    const brain = brainResult.rows[0];

    await client.query(
      `SELECT public.clone_brain_schema('brain_template', $1)`,
      [schemaName],
    );

    const key = generateApiKey();
    await client.query(
      `INSERT INTO management.brain_keys (brain_id, key_hash, key_prefix, label)
       VALUES ($1, $2, $3, $4)`,
      [brain.id, key.hash, key.prefix, 'default'],
    );

    await client.query('COMMIT');

    return c.json(
      {
        brain_id: brain.id,
        slug: brain.slug,
        schema_name: brain.schema_name,
        api_key: key.plaintext,
      },
      201,
    );
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('unique') || message.includes('duplicate')) {
      return c.json({ error: `Brain with slug "${slug}" already exists` }, 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

// ── GET /admin/brains ─────────────────────────────────────────────────────────
export async function listBrains(c: Context): Promise<Response> {
  const result = await pool.query(
    `SELECT id, slug, display_name, schema_name, created_at
       FROM management.brains
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC`,
  );

  return c.json(result.rows);
}

// ── GET /admin/brains/:slug ───────────────────────────────────────────────────
export async function getBrain(c: Context): Promise<Response> {
  const brain = await findBrainBySlug(c.req.param('slug')!);

  if (!brain) {
    return c.json({ error: 'Brain not found' }, 404);
  }

  // Discover installed extensions by checking which tables exist in the schema
  const tablesResult = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'`,
    [brain.schema_name],
  );

  const tables = new Set(
    tablesResult.rows.map((r: { table_name: string }) => r.table_name),
  );

  // Map known extension tables to extension names
  const extensionMap: Record<string, string[]> = {
    household: ['household_items', 'household_vendors'],
    maintenance: ['maintenance_tasks', 'maintenance_logs'],
    calendar: ['family_members', 'activities', 'important_dates'],
    meals: ['recipes', 'meal_plans', 'shopping_lists'],
    crm: ['professional_contacts', 'contact_interactions', 'opportunities'],
    jobhunt: [
      'companies',
      'job_postings',
      'applications',
      'interviews',
      'job_contacts',
    ],
  };

  const extensions: string[] = [];
  for (const [name, requiredTables] of Object.entries(extensionMap)) {
    if (requiredTables.every((t) => tables.has(t))) {
      extensions.push(name);
    }
  }

  return c.json({ ...brain, extensions });
}

// ── DELETE /admin/brains/:slug ────────────────────────────────────────────────
export async function deleteBrain(c: Context): Promise<Response> {
  const brain = await findBrainBySlug(c.req.param('slug')!);

  if (!brain) {
    return c.json({ error: 'Brain not found' }, 404);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Soft-delete the brain
    await client.query(
      `UPDATE management.brains SET deleted_at = now() WHERE id = $1`,
      [brain.id],
    );

    // Revoke all API keys
    await client.query(
      `UPDATE management.brain_keys
          SET revoked_at = now()
        WHERE brain_id = $1 AND revoked_at IS NULL`,
      [brain.id],
    );

    // Drop the schema (pg-format for safe identifier escaping)
    const dropSql = format('DROP SCHEMA IF EXISTS %I CASCADE', brain.schema_name);
    await client.query(dropSql);

    await client.query('COMMIT');

    return c.json({ deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
