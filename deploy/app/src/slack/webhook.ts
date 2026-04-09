import type { Context } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../db/pool.js';
import { withBrainSchema } from '../db/with-schema.js';
import { getEmbedding } from '../ai/embeddings.js';
import { extractMetadata } from '../ai/metadata.js';
import { config } from '../config.js';

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  text?: string;
  ts?: string;
  user?: string;
}

interface SlackRequestBody {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
}

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const baseStr = `v0:${timestamp}:${rawBody}`;
  const computed = `v0=${createHmac('sha256', signingSecret).update(baseStr).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

async function processSlackMessage(
  schemaName: string,
  text: string,
  channelId: string,
  slackTs: string | undefined,
  slackUser: string | undefined,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let isNew = false;

      await withBrainSchema(schemaName, async (query) => {
        const [embedding, metadata] = await Promise.all([
          getEmbedding(text),
          extractMetadata(text),
        ]);

        const enrichedMetadata = {
          ...metadata,
          source: 'slack',
          slack_channel: channelId,
          slack_ts: slackTs,
          slack_user: slackUser,
        };

        const result = await query(
          'SELECT * FROM upsert_thought($1, $2::vector, $3::jsonb)',
          [text, JSON.stringify(embedding), JSON.stringify(enrichedMetadata)],
        );
        isNew = result.rows[0]?.is_new ?? true;
      });

      // Success — send confirmation reply
      await sendSlackReply(channelId, slackTs, isNew ? 'Captured.' : 'Already captured.');
      return;
    } catch (err) {
      lastError = err;
      const isTransient = isTransientError(err);
      const willRetry = isTransient && attempt < MAX_RETRIES;
      let retryLabel = 'non-retryable';
      if (willRetry) retryLabel = 'will retry';
      else if (isTransient) retryLabel = 'retries exhausted';
      console.error(
        `[slack] Error processing message (attempt ${attempt + 1}/${MAX_RETRIES + 1}, ${retryLabel}):`,
        { schema: schemaName, channel: channelId, ts: slackTs, error: String(err) },
      );

      if (!willRetry) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  // All retries exhausted — notify user in Slack
  console.error('[slack] Message capture failed after retries:', {
    schema: schemaName, channel: channelId, ts: slackTs, error: String(lastError),
  });
  await sendSlackReply(channelId, slackTs, 'Failed to capture this message. Check server logs.');
}

function isTransientError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('timeout') ||
    msg.includes('too many clients') ||
    msg.includes('connection terminated');
}

async function sendSlackReply(channelId: string, threadTs: string | undefined, text: string): Promise<void> {
  const botToken = config.SLACK_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, thread_ts: threadTs, text }),
    });
  } catch (err) {
    console.warn('[slack] Failed to send reply:', err);
  }
}

// ── Slack event webhook handler ───────────────────────────────────────────────
export async function handleSlackEvent(c: Context): Promise<Response> {
  const rawBody = await c.req.text();

  let body: SlackRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  // URL verification challenge — allow through without signing secret so
  // operators can set up the endpoint URL in Slack before configuring the secret
  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge });
  }

  // All other requests require a configured signing secret
  if (!config.SLACK_SIGNING_SECRET) {
    return c.json({ error: 'Slack webhook disabled: SLACK_SIGNING_SECRET not configured' }, 403);
  }

  const timestamp = c.req.header('x-slack-request-timestamp') ?? '';
  const signature = c.req.header('x-slack-signature') ?? '';

  if (!timestamp || !signature) {
    return c.json({ error: 'Missing Slack signature headers' }, 401);
  }

  // Reject requests older than 5 minutes (replay protection)
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) {
    return c.json({ error: 'Request too old' }, 401);
  }

  if (!verifySlackSignature(config.SLACK_SIGNING_SECRET, timestamp, rawBody, signature)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = body.event;

  // Filter out events we don't care about
  if (
    !event ||
    event.type !== 'message' ||
    event.subtype ||
    event.bot_id ||
    !event.text?.trim()
  ) {
    return c.json({ ok: true });
  }

  const channelId = event.channel;
  if (!channelId) {
    return c.json({ ok: true });
  }

  // Look up which brain this channel belongs to
  const mapping = await pool.query(
    `SELECT sc.brain_id, b.schema_name, b.slug
       FROM management.slack_channels sc
       JOIN management.brains b ON b.id = sc.brain_id
      WHERE sc.slack_channel_id = $1
        AND b.deleted_at IS NULL`,
    [channelId],
  );

  if (mapping.rows.length === 0) {
    // Channel not mapped to any brain; ignore
    return c.json({ ok: true });
  }

  const { schema_name: schemaName } = mapping.rows[0];
  const text = event.text!.trim();
  const slackTs = event.ts;

  // Respond immediately to avoid Slack's 3-second timeout
  const response = c.json({ ok: true });

  // Process the message asynchronously with retry for transient failures
  setImmediate(() => {
    processSlackMessage(schemaName, text, channelId, slackTs, event.user).catch(
      () => {} // Final fallback — all retries exhausted, already logged
    );
  });

  return response;
}
