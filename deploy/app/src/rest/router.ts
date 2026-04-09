import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { resolveBrain } from '../auth/brain-resolver.js';
import { withBrainSchema } from '../db/with-schema.js';
import { listThoughts, getThought, updateThought, deleteThought } from './handlers/thoughts.js';
import { searchHandler } from './handlers/search.js';
import { statsHandler } from './handlers/stats.js';
import { captureHandler } from './handlers/capture.js';
import { connectionsHandler } from './handlers/connections.js';
import { healthHandler } from './handlers/health.js';

export const restRouter = new Hono();

// ── Brain auth middleware ──────────────────────────────────────────────────────
// Resolves the API key from x-brain-key header and attaches the brain context.
restRouter.use('*', async (c: Context, next: Next) => {
  const apiKey = c.req.header('x-brain-key');
  if (!apiKey) {
    return c.json({ error: 'API key required (x-brain-key header)' }, 401);
  }

  const brain = await resolveBrain(apiKey);
  if (!brain) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  c.set('brain', brain);
  await next();
});

// ── Helper: run a query within the authenticated brain's schema ───────────────
// Exported so handlers can use it without importing db/pool directly.
export async function brainQuery(
  c: Context,
  sql: string,
  params?: unknown[],
) {
  const brain = c.get('brain') as { schemaName: string };
  return withBrainSchema(brain.schemaName, (query) => query(sql, params));
}

// ── Routes ────────────────────────────────────────────────────────────────────
restRouter.get('/thoughts', listThoughts);
restRouter.get('/thought/:id', getThought);
restRouter.put('/thought/:id', updateThought);
restRouter.delete('/thought/:id', deleteThought);
restRouter.post('/search', searchHandler);
restRouter.get('/stats', statsHandler);
restRouter.post('/capture', captureHandler);
restRouter.get('/thought/:id/connections', connectionsHandler);
restRouter.get('/health', healthHandler);
