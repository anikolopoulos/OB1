import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { litellmRequest } from './litellm-client.js';
import { withBrainSchema } from '../db/with-schema.js';

const EXTRACTION_SYSTEM_PROMPT = `You are a thought extraction assistant for a personal knowledge base. Given a block of text, extract individual atomic thoughts, facts, ideas, or observations.

Rules:
- Each extracted item should be self-contained and understandable on its own
- Preserve the original meaning — do not infer or add information
- Each item should be 1-3 sentences
- Classify each item: "observation", "idea", "task", "meeting_note", "reflection", "reference", "fact", "decision"

Return ONLY valid JSON: { "thoughts": [{ "content": "...", "type": "..." }] }`;

export interface ExtractedItem {
  content: string;
  type: string;
}

export interface ClassifiedItem extends ExtractedItem {
  fingerprint: string;
  action: 'add' | 'skip';
  reason: string | null;
  similarity: number | null;
  matched_thought_id: string | null;
}

function computeFingerprint(text: string): string {
  return createHash('sha256')
    .update(text.trim().replace(/\s+/g, ' ').toLowerCase(), 'utf8')
    .digest('hex');
}

export async function extractThoughts(text: string): Promise<ExtractedItem[]> {
  const data = await litellmRequest('/chat/completions', {
    model: config.METADATA_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });

  const choices = data.choices as Array<{ message: { content: string } }> | undefined;
  if (!choices || choices.length === 0) {
    console.error('[extraction] LLM returned no choices, falling back to single item');
    return [{ content: text, type: 'observation' }];
  }

  const raw = choices[0].message.content;

  try {
    const parsed = JSON.parse(raw) as { thoughts?: unknown };
    if (
      parsed.thoughts &&
      Array.isArray(parsed.thoughts) &&
      parsed.thoughts.length > 0
    ) {
      const items = parsed.thoughts as Array<{ content?: unknown; type?: unknown }>;
      return items
        .filter((item) => typeof item.content === 'string' && item.content.trim().length > 0)
        .map((item) => ({
          content: (item.content as string).trim(),
          type: typeof item.type === 'string' ? item.type : 'observation',
        }));
    }
    console.error('[extraction] Unexpected JSON shape, falling back. Raw:', raw.slice(0, 200));
    return [{ content: text.slice(0, 2000), type: 'observation' }];
  } catch {
    console.error('[extraction] Failed to parse LLM response as JSON, falling back. Raw:', raw.slice(0, 200));
    return [{ content: text.slice(0, 2000), type: 'observation' }];
  }
}

export async function classifyItems(
  schemaName: string,
  items: ExtractedItem[],
): Promise<ClassifiedItem[]> {
  if (items.length === 0) return [];

  const fingerprints = items.map((item) => computeFingerprint(item.content));

  // Batch-check all fingerprints against the brain's thoughts table in one query
  const existingFingerprints = await withBrainSchema(schemaName, async (query) => {
    const result = await query(
      `SELECT content_fingerprint FROM thoughts WHERE content_fingerprint = ANY($1)`,
      [fingerprints],
    );
    return new Set(result.rows.map((row: { content_fingerprint: string }) => row.content_fingerprint));
  });

  return items.map((item, i) => {
    const fingerprint = fingerprints[i]!;
    const isDuplicate = existingFingerprints.has(fingerprint);

    return {
      ...item,
      fingerprint,
      action: isDuplicate ? 'skip' as const : 'add' as const,
      reason: isDuplicate ? 'duplicate content' : null,
      similarity: null,
      matched_thought_id: null,
    };
  });
}
