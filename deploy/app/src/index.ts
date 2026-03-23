import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { config } from './config.js';
import { resolveBrain } from './auth/brain-resolver.js';
import { withBrainSchema } from './db/with-schema.js';
import { getEmbedding } from './ai/embeddings.js';
import { extractMetadata } from './ai/metadata.js';
import { createMcpServer } from './mcp/server-factory.js';
import { adminRouter } from './admin/router.js';
import { slackRouter } from './slack/router.js';
import type { ToolContext } from './mcp/tool-context.js';

const app = new Hono();

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'ob1', uptime: process.uptime() }),
);

// ── Admin API ─────────────────────────────────────────────────────────────────
app.route('/admin', adminRouter);

// ── Slack webhook ─────────────────────────────────────────────────────────────
app.route('/slack', slackRouter);

// ── MCP endpoint ──────────────────────────────────────────────────────────────

function extractApiKey(c: Context): string | undefined {
  return c.req.query('key') ?? c.req.header('x-brain-key');
}

async function handleMcpRequest(c: Context): Promise<Response> {
  const apiKey = extractApiKey(c);
  if (!apiKey) {
    return c.json({ error: 'API key required (query param "key" or header "x-brain-key")' }, 401);
  }

  const brain = await resolveBrain(apiKey);
  if (!brain) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  return withBrainSchema(brain.schemaName, async (query) => {
    const ctx: ToolContext = {
      query,
      getEmbedding,
      extractMetadata,
      schemaName: brain.schemaName,
    };

    const server = await createMcpServer(ctx);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    try {
      // Claude Desktop Accept header fix: some clients don't send
      // text/event-stream in Accept, which the transport expects.
      const incomingRequest = c.req.raw;
      const accept = incomingRequest.headers.get('accept') ?? '';
      let patchedRequest = incomingRequest;

      if (!accept.includes('text/event-stream')) {
        const headers = new Headers(incomingRequest.headers);
        headers.set(
          'accept',
          accept ? `${accept}, text/event-stream` : 'text/event-stream',
        );
        patchedRequest = new Request(incomingRequest.url, {
          method: incomingRequest.method,
          headers,
          body: incomingRequest.body,
          // @ts-expect-error -- duplex is required for streaming bodies
          duplex: 'half',
        });
      }

      return await transport.handleRequest(patchedRequest);
    } finally {
      await server.close().catch(() => {});
    }
  });
}

// Handle POST/GET/DELETE for /mcp and /mcp/* (session-based transports)
app.on(['POST', 'GET', 'DELETE'], ['/mcp', '/mcp/*'], handleMcpRequest);

// ── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Start server ──────────────────────────────────────────────────────────────
const port = parseInt(config.PORT, 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ob1 server listening on http://localhost:${info.port}`);
  console.log(`  MCP:   POST /mcp`);
  console.log(`  Admin: /admin/*`);
  console.log(`  Slack: POST /slack/events`);
  console.log(`  Health: GET /health`);
});
