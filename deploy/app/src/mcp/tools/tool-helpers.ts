/**
 * Shared helpers for MCP tool handlers.
 *
 * Provides consistent error handling and response formatting so that each
 * tool definition can focus on its business logic rather than boilerplate.
 */

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
): (args: T, extra: unknown) => Promise<ToolResult> {
  return async (args: T, extra: unknown) => {
    try {
      return await fn(args, extra);
    } catch (err: unknown) {
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
