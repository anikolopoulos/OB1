import type { Context } from 'hono';

// GET /api/health
// Brain auth middleware already validated the key — reaching here means valid.
// Returns brain identity so the dashboard can display who is logged in.
export async function healthHandler(c: Context): Promise<Response> {
  const brain = c.get('brain') as { brainId: string; schemaName: string; slug: string; displayName: string };
  return c.json({
    status: 'ok',
    brain: {
      slug: brain.slug,
      display_name: brain.displayName,
    },
  });
}
