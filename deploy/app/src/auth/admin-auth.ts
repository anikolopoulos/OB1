import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export async function adminAuth(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header('Authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const token = header.slice('Bearer '.length);
  const a = Buffer.from(token);
  const b = Buffer.from(config.ADMIN_API_KEY);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ error: 'Invalid admin API key' }, 401);
  }

  await next();
}
