import type { Context } from 'hono';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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

function computeFingerprint(text: string): string {
  const normalised = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

// ── Slack event webhook handler ───────────────────────────────────────────────
export async function handleSlackEvent(c: Context): Promise<Response> {
  const rawBody = await c.req.text();

  // Verify Slack request signature if signing secret is configured
  if (config.SLACK_SIGNING_SECRET) {
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
  }

  let body: SlackRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  // URL verification challenge (Slack sends this when configuring the endpoint)
  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge });
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

  // Process the message asynchronously
  setImmediate(async () => {
    try {
      await withBrainSchema(schemaName, async (query) => {
        // Generate embedding and extract metadata in parallel
        const [embedding, metadata] = await Promise.all([
          getEmbedding(text),
          extractMetadata(text),
        ]);

        const enrichedMetadata = {
          ...metadata,
          source: 'slack',
          slack_channel: channelId,
          slack_ts: slackTs,
          slack_user: event.user,
        };

        await query(
          `INSERT INTO thoughts (content, content_fingerprint, embedding, metadata)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (content_fingerprint)
              WHERE content_fingerprint IS NOT NULL
              DO UPDATE SET
                updated_at = now(),
                metadata   = thoughts.metadata || EXCLUDED.metadata`,
          [text, computeFingerprint(text), JSON.stringify(embedding), JSON.stringify(enrichedMetadata)],
        );
      });

      // Reply in Slack thread to confirm capture
      const botToken = config.SLACK_BOT_TOKEN;

      if (botToken) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            thread_ts: slackTs,
            text: 'Captured.',
          }),
        }).catch(() => {
          // Non-critical: swallow Slack API errors
        });
      }
    } catch (err) {
      console.error('[slack] Error processing message:', err);
    }
  });

  return response;
}
