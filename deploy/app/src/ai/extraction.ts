import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { litellmRequest } from './litellm-client.js';
import { withBrainSchema } from '../db/with-schema.js';

const EXTRACTION_SYSTEM_PROMPT = `You are a thought extraction assistant for a personal knowledge base that uses semantic search. Given a block of text, extract individual atomic thoughts, facts, ideas, or observations.

Rules:
- Each thought must contain exactly ONE fact, idea, or observation — never two
- If a sentence contains multiple facts (e.g., "She is British and Canadian. She is deceased."), split them into separate thoughts
- Ask yourself: "Does this thought answer exactly one question?" If it answers two, split it
- Each thought should be 1 sentence. Use 2 sentences only if the second is essential context for understanding the first
- Preserve the original meaning — do not infer or add information
- Each thought must be self-contained and understandable without the other extracted thoughts
- Classify each item: "observation", "task", "idea", "reference", "person_note"

Examples of correct splitting:
  INPUT: "My mother's name is Susan. She is British and Canadian. She is deceased."
  OUTPUT: 3 thoughts → "My mother's name is Susan." / "My mother is British and Canadian." / "My mother is deceased."

  INPUT: "I'm based in Athens and have Greek and Canadian nationalities."
  OUTPUT: 2 thoughts → "I am based in Athens." / "I have Greek and Canadian nationalities."

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
      action: isDuplicate ? 'skip' : 'add',
      reason: isDuplicate ? 'duplicate content' : null,
      similarity: null,
      matched_thought_id: null,
    };
  });
}
