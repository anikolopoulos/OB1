import { Hono } from 'hono';
import { handleSlackEvent } from './webhook.js';

export const slackRouter = new Hono();

slackRouter.post('/events', handleSlackEvent);
