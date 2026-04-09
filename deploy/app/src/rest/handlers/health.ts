import type { Context } from 'hono';

// GET /api/health
// Brain auth middleware already validated the key — reaching here means valid.
export async function healthHandler(c: Context): Promise<Response> {
  return c.json({ status: 'ok' });
}
