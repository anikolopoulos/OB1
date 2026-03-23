import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pool } from '../db/pool.js';
import type { ToolContext } from './tool-context.js';
import { registerCoreTools } from './tools/core.js';
import { EXTENSIONS } from './tools/registry.js';

// ── In-memory cache for schema tables (60 s TTL) ─────────────────────────────
interface SchemaCacheEntry {
  tables: Set<string>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
const schemaTableCache = new Map<string, SchemaCacheEntry>();

/** Invalidate the cached table list for a schema (call after installing extensions). */
export function invalidateSchemaCache(schemaName: string): void {
  schemaTableCache.delete(schemaName);
}

async function getSchemaTables(schemaName: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = schemaTableCache.get(schemaName);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tables;
  }

  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'`,
    [schemaName],
  );
  const tables = new Set(result.rows.map((r: { table_name: string }) => r.table_name));
  schemaTableCache.set(schemaName, { tables, fetchedAt: now });
  return tables;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export async function createMcpServer(
  ctx: ToolContext,
): Promise<McpServer> {
  const server = new McpServer({ name: 'open-brain', version: '2.0.0' });

  // 1. Register core tools (thoughts CRUD, search, etc.)
  registerCoreTools(server, ctx);

  // 2. Discover which tables exist in this brain's schema
  const tables = await getSchemaTables(ctx.schemaName);

  // 3. For each extension, register if all required tables are present
  for (const ext of EXTENSIONS) {
    if (ext.requiredTables.every((t) => tables.has(t))) {
      ext.register(server, ctx);
    }
  }

  return server;
}
