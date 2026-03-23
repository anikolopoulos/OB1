import { Hono } from 'hono';
import { adminAuth } from '../auth/admin-auth.js';
import { createBrain, listBrains, getBrain, deleteBrain } from './handlers/brains.js';
import { createApiKey, revokeApiKey } from './handlers/api-keys.js';
import { installExtension } from './handlers/extensions.js';
import { linkSlackChannel, unlinkSlackChannel } from './handlers/slack-channels.js';

export const adminRouter = new Hono();

// All admin routes require authentication
adminRouter.use('*', adminAuth);

// ── Brain CRUD ────────────────────────────────────────────────────────────────
adminRouter.post('/brains', createBrain);
adminRouter.get('/brains', listBrains);
adminRouter.get('/brains/:slug', getBrain);
adminRouter.delete('/brains/:slug', deleteBrain);

// ── API Key management ────────────────────────────────────────────────────────
adminRouter.post('/brains/:slug/api-keys', createApiKey);
adminRouter.delete('/brains/:slug/api-keys/:id', revokeApiKey);

// ── Extension installation ────────────────────────────────────────────────────
adminRouter.post('/brains/:slug/extensions/:name', installExtension);

// ── Slack channel mapping ─────────────────────────────────────────────────────
adminRouter.post('/brains/:slug/slack', linkSlackChannel);
adminRouter.delete('/brains/:slug/slack', unlinkSlackChannel);
