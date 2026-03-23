import type { Context } from 'hono';
import { pool } from '../../db/pool.js';
import { findBrainBySlug } from './shared.js';

// ── POST /admin/brains/:slug/slack ────────────────────────────────────────────
export async function linkSlackChannel(c: Context): Promise<Response> {
  const body = await c.req.json<{ channel_id?: string }>();

  if (!body.channel_id) {
    return c.json({ error: 'channel_id is required' }, 400);
  }

  const brain = await findBrainBySlug(c.req.param('slug')!);

  if (!brain) {
    return c.json({ error: 'Brain not found' }, 404);
  }

  try {
    const result = await pool.query(
      `INSERT INTO management.slack_channels (brain_id, slack_channel_id)
       VALUES ($1, $2)
       RETURNING id, brain_id, slack_channel_id, created_at`,
      [brain.id, body.channel_id],
    );

    return c.json(result.rows[0], 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('unique') || message.includes('duplicate')) {
      return c.json(
        { error: `Channel "${body.channel_id}" is already linked to a brain` },
        409,
      );
    }
    throw err;
  }
}

// ── DELETE /admin/brains/:slug/slack ──────────────────────────────────────────
export async function unlinkSlackChannel(c: Context): Promise<Response> {
  const result = await pool.query(
    `DELETE FROM management.slack_channels sc
      USING management.brains b
      WHERE sc.brain_id = b.id
        AND b.slug = $1
        AND b.deleted_at IS NULL
      RETURNING sc.id`,
    [c.req.param('slug')!],
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'No Slack channel linked to this brain' }, 404);
  }

  return c.json({ unlinked: true, count: result.rows.length });
}
