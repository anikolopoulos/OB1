import http from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { resolveBrain } from './auth/brain-resolver.js';
import { withBrainSchema, type QueryFn } from './db/with-schema.js';
import { getEmbedding } from './ai/embeddings.js';
import { extractMetadata } from './ai/metadata.js';
import { createMcpServer } from './mcp/server-factory.js';
import { adminRouter } from './admin/router.js';
import { slackRouter } from './slack/router.js';
import type { ToolContext } from './mcp/tool-context.js';

// ── Hono app (admin, slack, health — everything except /mcp) ─────────────────
const app = new Hono();

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'ob1', uptime: process.uptime() }),
);

app.route('/admin', adminRouter);
app.route('/slack', slackRouter);

app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const honoListener = getRequestListener(app.fetch);

// ── MCP handler (raw Node.js req/res for proper SSE streaming) ───────────────
async function handleMcp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const rawHeader = req.headers['x-brain-key'];
  const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const apiKey = url.searchParams.get('key') ?? headerKey;

  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API key required (query param "key" or header "x-brain-key")' }));
    return;
  }

  const brain = await resolveBrain(apiKey);
  if (!brain) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid API key' }));
    return;
  }

  // Create a query function that acquires/releases a DB connection per query.
  // This avoids holding a pool client for the entire SSE stream lifetime.
  const perQueryFn: QueryFn = (text, params) =>
    withBrainSchema(brain.schemaName, (query) => query(text, params));

  const ctx: ToolContext = {
    query: perQueryFn,
    getEmbedding,
    extractMetadata,
    schemaName: brain.schemaName,
  };

  const mcpServer = await createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcpServer.connect(transport);

  try {
    await transport.handleRequest(req, res);
  } finally {
    await mcpServer.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

// ── HTTP server: route /mcp to raw handler, everything else to Hono ──────────
const port = parseInt(config.PORT, 10);

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  if (url === '/mcp' || url.startsWith('/mcp/') || url.startsWith('/mcp?')) {
    try {
      await handleMcp(req, res);
    } catch (err) {
      console.error('[mcp] Unhandled error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      if (!res.writableEnded) {
        if (res.headersSent) {
          // SSE stream already started — close cleanly without injecting JSON
          res.end();
        } else {
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    }
    return;
  }

  // Everything else goes through Hono
  honoListener(req, res);
});

server.listen(port, () => {
  console.log(`ob1 server listening on http://localhost:${port}`);
  console.log(`  MCP:   POST /mcp (Node.js native streaming)`);
  console.log(`  Admin: /admin/*`);
  console.log(`  Slack: POST /slack/events`);
  console.log(`  Health: GET /health`);
});
