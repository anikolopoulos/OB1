/**
 * Shared helpers for MCP tool handlers.
 *
 * Provides consistent error handling and response formatting so that each
 * tool definition can focus on its business logic rather than boilerplate.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** The shape every MCP tool handler must return (compatible with the MCP SDK). */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Wraps a tool handler with a standardised try/catch that returns
 * a consistent MCP error response on failure.
 *
 * The returned function accepts (args, extra) to match the signature
 * that McpServer.tool() expects, but `extra` is simply forwarded.
 */
export function withErrorHandler<T>(
  fn: (args: T, extra: unknown) => Promise<ToolResult>,
  toolName?: string,
): (args: T, extra: unknown) => Promise<ToolResult> {
  return async (args: T, extra: unknown) => {
    try {
      return await fn(args, extra);
    } catch (err: unknown) {
      console.error(`[mcp-tool${toolName ? `:${toolName}` : ''}] Unhandled error:`, err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
}

/** Build a successful text-content MCP response from a plain string. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }] };
}

/** Build a successful text-content MCP response from a JSON-serialisable value. */
export function jsonResult(value: unknown): ToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

/** Build an error text-content MCP response. */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Registers an MCP tool with a STRICT input schema, so that unknown/typo'd
 * argument keys are rejected with a validation error instead of being
 * silently stripped (which is what the legacy `server.tool()` raw-shape
 * overload does).
 *
 * This is the single registration path for MCP tools in this codebase —
 * every tool with input arguments should be registered via this helper.
 * Tools that need annotations (e.g. destructiveHint) beyond a plain
 * description should call `server.registerTool` directly using the same
 * `z.object(shape).strict()` pattern.
 *
 * The tool name is threaded into `withErrorHandler` so every tool gets
 * consistent log attribution on unhandled errors.
 */
export function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>, extra: unknown) => Promise<ToolResult>,
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema: z.object(shape).strict(),
    },
    withErrorHandler(handler, name),
  );
}
