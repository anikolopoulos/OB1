import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { QueryFn } from '../db/with-schema.js';

export interface ToolContext {
  query: QueryFn;
  getEmbedding: (text: string) => Promise<number[]>;
  extractMetadata: (text: string) => Promise<Record<string, unknown>>;
  schemaName: string;
}

export interface ExtensionDefinition {
  name: string;
  requiredTables: string[];
  register: (server: McpServer, ctx: ToolContext) => void;
}
