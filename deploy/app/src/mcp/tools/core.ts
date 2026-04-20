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
            id: string;
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
            `ID: ${t.id}`,
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
      const sql = `SELECT id, content, metadata, created_at FROM thoughts ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx}`;

      const { rows: data } = await ctx.query(sql, params);

      if (!data || !data.length) {
        return textResult('No thoughts found.');
      }

      const results = data.map(
        (
          t: {
            id: string;
            content: string;
            metadata: Record<string, unknown>;
            created_at: string;
          },
          i: number
        ) => {
          const m = t.metadata ?? {};
          const tags = Array.isArray(m.topics) ? (m.topics as string[]).join(', ') : '';
          return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type ?? '??'}${tags ? ' - ' + tags : ''})\n   ID: ${t.id}\n   ${t.content}`;
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
    [
      'Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically. Use when the user wants to save something to their brain: notes, insights, decisions, observations, or migrated content.',
      '',
      'Each thought must satisfy BOTH rules:',
      '',
      '  1. ATOMIC — one fact, idea, or observation per thought. If the user gives you a multi-point input, split it into multiple `capture_thought` calls, one per idea.',
      '',
      '  2. SELF-CONTAINED — when later retrieved by semantic search, each thought appears ALONE with no sibling context. Include the subject, scope, or qualifier needed for the thought to make sense on its own.',
      '',
      'Atomic and self-contained are both required. Over-splitting into unanchored fragments is just as bad as capturing a compound thought.',
      '',
      'Example — input: "My home router is a Unifi Fiber Cloud Gateway and its IP is 10.173.10.1."',
      "  ✓ Good: \"My home router is a Unifi Fiber Cloud Gateway.\" + \"My home router's IP is 10.173.10.1.\"",
      '  ✗ Bad:  "The router is a Unifi Fiber Cloud Gateway." + "The IP is 10.173.10.1." (second fragment is unanchored — IP of what?)',
    ].join('\n'),
    {
      content: z
        .string()
        .describe(
          'The thought to capture — one atomic idea, written so it stands alone when retrieved later with no sibling context'
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

      const { is_new } = rows[0] as { id: string; is_new: boolean };
      const meta = metadata as Record<string, unknown>;
      const parts: string[] = [
        is_new
          ? `Captured as ${meta.type ?? 'thought'}`
          : `Updated existing thought (duplicate content)`,
      ];
      if (Array.isArray(meta.topics) && meta.topics.length)
        parts.push((meta.topics as string[]).join(', '));
      if (Array.isArray(meta.people) && meta.people.length)
        parts.push(`People: ${(meta.people as string[]).join(', ')}`);
      if (Array.isArray(meta.action_items) && meta.action_items.length)
        parts.push(`Actions: ${(meta.action_items as string[]).join('; ')}`);
      const confirmation = parts.join(' — ');

      return textResult(confirmation);
    })
  );

  // ── update_thought ───────────────────────────────────────────────────────────
  server.registerTool(
    'update_thought',
    {
      title: 'Update Thought',
      description: [
        'Update the content of an existing thought, identified by the `id` returned from `search_thoughts` or `list_thoughts`. Use ONLY to:',
        '  • fix factual errors',
        '  • correct transcription mistakes',
        '  • complete a thought that was captured incomplete',
        "  • restore self-contained context to a thought captured as an unanchored fragment (e.g. editing \"The IP is 10.173.10.1\" to \"My home router's IP is 10.173.10.1\")",
        '',
        'Thoughts in the Open Brain are atomic — new ideas, later reflections, or added context belong in NEW thoughts, never appended to old ones. If the user asks you to "add X to that thought", capture a new related thought instead; semantic search will surface it alongside the original.',
        '',
        'Mandatory two-phase protocol, one thought at a time:',
        '  1. Call first with { id, new_content } → returns a BEFORE / AFTER preview. No changes are made.',
        '  2. Show the preview to the user verbatim and wait for their explicit confirmation for *that specific* thought.',
        '  3. Only then call again with { id, new_content, confirm: true } to execute.',
        '',
        'Never skip the preview. Never batch-confirm. Never proceed without an explicit "yes" from the user for the thought in question.',
        '',
        '`new_content` must be the complete final text of the thought after editing — not a diff, patch, or instruction. Updating re-embeds the thought and re-extracts its metadata.',
      ].join('\n'),
      inputSchema: {
        id: z.string().uuid().describe('UUID of the thought to update (from search_thoughts or list_thoughts)'),
        new_content: z.string().min(1).describe('Complete final text of the thought after editing — never a diff or instruction'),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe('Set to true ONLY after the user has explicitly approved the preview returned from a prior call with the same id and new_content'),
      },
      annotations: {
        title: 'Update Thought',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withErrorHandler(async ({ id, new_content, confirm }) => {
      const { rows: existingRows } = await ctx.query(
        'SELECT id, content, metadata, created_at FROM thoughts WHERE id = $1',
        [id]
      );
      if (!existingRows.length) {
        return errorResult(`No thought found with id ${id}`);
      }
      const existing = existingRows[0] as {
        id: string;
        content: string;
        metadata: Record<string, unknown>;
        created_at: string;
      };

      if (!confirm) {
        return textResult(buildUpdatePreview(id, existing, new_content));
      }

      if (existing.content === new_content) {
        return textResult(`No change — new_content is identical to the existing content of thought ${id}.`);
      }

      const [embedding, freshMetadata] = await Promise.all([
        ctx.getEmbedding(new_content),
        ctx.extractMetadata(new_content),
      ]);

      const mergedMetadata = {
        ...(existing.metadata ?? {}),
        ...freshMetadata,
      };

      try {
        await ctx.query(
          `UPDATE thoughts
              SET content             = $1,
                  content_fingerprint = encode(
                    sha256(convert_to(lower(trim(regexp_replace($1, '\\s+', ' ', 'g'))), 'UTF8')),
                    'hex'
                  ),
                  embedding           = $2::vector,
                  metadata            = $3::jsonb
            WHERE id = $4`,
          [new_content, JSON.stringify(embedding), JSON.stringify(mergedMetadata), id]
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('content_fingerprint')) {
          return errorResult(
            `Cannot update: another thought already has this exact content. Locate it via search_thoughts and merge or delete one before retrying.`
          );
        }
        throw err;
      }

      return textResult(
        [
          `Updated thought ${id}.`,
          '',
          'BEFORE:',
          indent(existing.content),
          '',
          'AFTER:',
          indent(new_content),
        ].join('\n')
      );
    })
  );

  // ── delete_thought ───────────────────────────────────────────────────────────
  server.registerTool(
    'delete_thought',
    {
      title: 'Delete Thought',
      description: [
        'Permanently delete a thought from the Open Brain, identified by the `id` returned from `search_thoughts` or `list_thoughts`. Deletion is IRREVERSIBLE — the thought, its embedding, and its metadata are removed and cannot be recovered. There is no soft-delete and no undo.',
        '',
        'Use only when:',
        '  • the user has explicitly asked to delete a specific thought they have already identified, OR',
        '  • cleaning up a duplicate or obsolete thought that has been replaced by an updated one.',
        '',
        'Do NOT propose deletions speculatively. Do NOT batch-delete.',
        '',
        'Mandatory two-phase protocol, one thought at a time:',
        '  1. Call first with { id } → returns the full content of the thought as a confirmation preview. Nothing is deleted.',
        '  2. Show the preview to the user verbatim and wait for their explicit confirmation for *that specific* thought.',
        '  3. Only then call again with { id, confirm: true } to execute the deletion.',
        '',
        'Every deletion requires the user to say "yes" for that specific thought. There is no "approve all" or bulk mode. If the user is deleting many thoughts in one session, each one still goes through this flow individually — one id, one preview, one confirmation, one delete.',
      ].join('\n'),
      inputSchema: {
        id: z.string().uuid().describe('UUID of the thought to delete (from search_thoughts or list_thoughts)'),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe('Set to true ONLY after the user has explicitly approved the preview returned from a prior call with the same id'),
      },
      annotations: {
        title: 'Delete Thought',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withErrorHandler(async ({ id, confirm }) => {
      const { rows: existingRows } = await ctx.query(
        'SELECT id, content, metadata, created_at FROM thoughts WHERE id = $1',
        [id]
      );
      if (!existingRows.length) {
        return errorResult(`No thought found with id ${id}`);
      }
      const existing = existingRows[0] as {
        id: string;
        content: string;
        metadata: Record<string, unknown>;
        created_at: string;
      };

      if (!confirm) {
        return textResult(buildDeletePreview(id, existing));
      }

      const { rowCount } = await ctx.query('DELETE FROM thoughts WHERE id = $1', [id]);
      if (!rowCount) {
        return errorResult(`Thought ${id} no longer exists — it was deleted or modified between the preview and this confirmation.`);
      }

      return textResult(
        [
          `Deleted thought ${id}. Its content was:`,
          '',
          indent(existing.content),
          '',
          '(This echo is your only record of the deleted thought — recapture via capture_thought if needed.)',
        ].join('\n')
      );
    })
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function indent(text: string, prefix = '  '): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function formatMetaLine(metadata: Record<string, unknown>, createdAt: string): string {
  const m = metadata ?? {};
  const bits: string[] = [`captured ${new Date(createdAt).toLocaleDateString()}`];
  if (m.type) bits.push(`type: ${m.type}`);
  if (Array.isArray(m.topics) && m.topics.length)
    bits.push(`topics: ${(m.topics as string[]).join(', ')}`);
  return bits.join(', ');
}

function buildUpdatePreview(
  id: string,
  existing: { content: string; metadata: Record<string, unknown>; created_at: string },
  newContent: string
): string {
  return [
    `PREVIEW — update_thought will change thought ${id}`,
    `(${formatMetaLine(existing.metadata, existing.created_at)})`,
    '',
    'BEFORE:',
    indent(existing.content),
    '',
    'AFTER:',
    indent(newContent),
    '',
    'Show this preview to the user and wait for their explicit "yes". To apply,',
    'call update_thought again with the same id and new_content AND confirm: true.',
    'Otherwise the thought is unchanged.',
  ].join('\n');
}

function buildDeletePreview(
  id: string,
  existing: { content: string; metadata: Record<string, unknown>; created_at: string }
): string {
  return [
    `PREVIEW — delete_thought will PERMANENTLY remove this thought:`,
    '',
    `  ID: ${id}`,
    `  ${formatMetaLine(existing.metadata, existing.created_at)}`,
    `  Content:`,
    indent(existing.content, '    '),
    '',
    'This is irreversible — there is no undo and no soft-delete.',
    '',
    'Show this preview to the user and wait for their explicit "yes" for THIS',
    'specific thought. To confirm deletion, call delete_thought again with the',
    'same id AND confirm: true. Otherwise nothing is deleted.',
  ].join('\n');
}
