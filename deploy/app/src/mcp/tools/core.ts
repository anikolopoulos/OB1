import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../tool-context.js';
import { withErrorHandler, textResult, errorResult } from './tool-helpers.js';

export function registerCoreTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'search_thoughts',
    'Search captured thoughts by meaning. Use this when the user asks about a topic, person, or idea they\'ve previously captured.',
    {
      query: z.string().describe('What to search for'),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.5),
    },
    withErrorHandler(async ({ query, limit, threshold }) => {
      const qEmb = await ctx.getEmbedding(query);

      const { rows: data } = await ctx.query(
        'SELECT * FROM match_thoughts($1::vector, $2::float, $3::int, $4::jsonb)',
        [JSON.stringify(qEmb), threshold, limit, JSON.stringify({})]
      );

      if (!data || data.length === 0) {
        return textResult(`No thoughts found matching "${query}".`);
      }

      const results = data.map(
        (
          t: {
            content: string;
            metadata: Record<string, unknown>;
            similarity: number;
            created_at: string;
          },
          i: number
        ) => {
          const m = t.metadata ?? {};
          const parts = [
            `--- Result ${i + 1} (${(t.similarity * 100).toFixed(1)}% match) ---`,
            `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
            `Type: ${m.type ?? 'unknown'}`,
          ];
          if (Array.isArray(m.topics) && m.topics.length)
            parts.push(`Topics: ${(m.topics as string[]).join(', ')}`);
          if (Array.isArray(m.people) && m.people.length)
            parts.push(`People: ${(m.people as string[]).join(', ')}`);
          if (Array.isArray(m.action_items) && m.action_items.length)
            parts.push(`Actions: ${(m.action_items as string[]).join('; ')}`);
          parts.push(`\n${t.content}`);
          return parts.join('\n');
        }
      );

      return textResult(`Found ${data.length} thought(s):\n\n${results.join('\n\n')}`);
    })
  );

  server.tool(
    'list_thoughts',
    'List recently captured thoughts with optional filters by type, topic, person, or time range.',
    {
      limit: z.number().optional().default(10),
      type: z
        .string()
        .optional()
        .describe('Filter by type: observation, task, idea, reference, person_note'),
      topic: z.string().optional().describe('Filter by topic tag'),
      person: z.string().optional().describe('Filter by person mentioned'),
      days: z.number().optional().describe('Only thoughts from the last N days'),
    },
    withErrorHandler(async ({ limit, type, topic, person, days }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      if (type) {
        paramIdx++;
        conditions.push(`metadata @> $${paramIdx}::jsonb`);
        params.push(JSON.stringify({ type }));
      }
      if (topic) {
        paramIdx++;
        conditions.push(`metadata @> $${paramIdx}::jsonb`);
        params.push(JSON.stringify({ topics: [topic] }));
      }
      if (person) {
        paramIdx++;
        conditions.push(`metadata @> $${paramIdx}::jsonb`);
        params.push(JSON.stringify({ people: [person] }));
      }
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        paramIdx++;
        conditions.push(`created_at >= $${paramIdx}`);
        params.push(since.toISOString());
      }

      paramIdx++;
      params.push(limit);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT content, metadata, created_at FROM thoughts ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx}`;

      const { rows: data } = await ctx.query(sql, params);

      if (!data || !data.length) {
        return textResult('No thoughts found.');
      }

      const results = data.map(
        (
          t: { content: string; metadata: Record<string, unknown>; created_at: string },
          i: number
        ) => {
          const m = t.metadata ?? {};
          const tags = Array.isArray(m.topics) ? (m.topics as string[]).join(', ') : '';
          return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type ?? '??'}${tags ? ' - ' + tags : ''})\n   ${t.content}`;
        }
      );

      return textResult(`${data.length} recent thought(s):\n\n${results.join('\n\n')}`);
    })
  );

  server.tool(
    'thought_stats',
    'Get a summary of all captured thoughts: totals, types, top topics, and people.',
    {},
    withErrorHandler(async () => {
      const { rows: countRows } = await ctx.query('SELECT count(*) FROM thoughts');
      const count = parseInt(countRows[0].count, 10);

      const { rows: data } = await ctx.query(
        'SELECT metadata, created_at FROM thoughts ORDER BY created_at DESC LIMIT 10000'
      );

      const types: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const people: Record<string, number> = {};

      for (const r of data ?? []) {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        if (m.type) types[m.type as string] = (types[m.type as string] ?? 0) + 1;
        if (Array.isArray(m.topics))
          for (const t of m.topics) topics[t as string] = (topics[t as string] ?? 0) + 1;
        if (Array.isArray(m.people))
          for (const p of m.people) people[p as string] = (people[p as string] ?? 0) + 1;
      }

      const sort = (o: Record<string, number>): [string, number][] =>
        Object.entries(o)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

      const lines: string[] = [
        `Total thoughts: ${count}`,
        `Date range: ${
          data?.length
            ? new Date(data[data.length - 1].created_at).toLocaleDateString() +
              ' → ' +
              new Date(data[0].created_at).toLocaleDateString()
            : 'N/A'
        }`,
        '',
        'Types:',
        ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
      ];

      if (Object.keys(topics).length) {
        lines.push('', 'Top topics:');
        for (const [k, v] of sort(topics)) lines.push(`  ${k}: ${v}`);
      }

      if (Object.keys(people).length) {
        lines.push('', 'People mentioned:');
        for (const [k, v] of sort(people)) lines.push(`  ${k}: ${v}`);
      }

      return textResult(lines.join('\n'));
    })
  );

  server.tool(
    'capture_thought',
    'Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically. Use this when the user wants to save something to their brain directly from any AI client — notes, insights, decisions, or migrated content from other systems.',
    {
      content: z
        .string()
        .describe(
          'The thought to capture — a clear, standalone statement that will make sense when retrieved later by any AI'
        ),
    },
    withErrorHandler(async ({ content }) => {
      const [embedding, metadata] = await Promise.all([
        ctx.getEmbedding(content),
        ctx.extractMetadata(content),
      ]);

      const { rows } = await ctx.query(
        'SELECT * FROM upsert_thought($1, $2::vector, $3::jsonb)',
        [content, JSON.stringify(embedding), JSON.stringify({ ...metadata, source: 'mcp' })]
      );

      if (!rows || rows.length === 0) {
        return errorResult('Failed to capture thought: no row returned');
      }

      const { is_new } = rows[0] as { id: string; fingerprint: string; is_new: boolean };
      const meta = metadata as Record<string, unknown>;
      let confirmation = is_new
        ? `Captured as ${meta.type ?? 'thought'}`
        : `Updated existing thought (duplicate content)`;
      if (Array.isArray(meta.topics) && meta.topics.length)
        confirmation += ` — ${(meta.topics as string[]).join(', ')}`;
      if (Array.isArray(meta.people) && meta.people.length)
        confirmation += ` | People: ${(meta.people as string[]).join(', ')}`;
      if (Array.isArray(meta.action_items) && meta.action_items.length)
        confirmation += ` | Actions: ${(meta.action_items as string[]).join('; ')}`;

      return textResult(confirmation);
    })
  );
}
