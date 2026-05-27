import { config } from '../config.js';
import { litellmRequest } from './litellm-client.js';

export const METADATA_SYSTEM_PROMPT = `Extract metadata from the user's captured thought. Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`;

const FALLBACK_METADATA: Record<string, unknown> = {
  topics: ['uncategorized'],
  type: 'observation',
};

export async function extractMetadata(
  text: string,
): Promise<Record<string, unknown>> {
  const data = await litellmRequest('/chat/completions', {
    model: config.METADATA_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: METADATA_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });

  const choices = data.choices as Array<{ message: { content: string } }> | undefined;
  if (!choices || choices.length === 0) {
    throw new Error(`LiteLLM metadata extraction returned no choices. Model: ${config.METADATA_MODEL}`);
  }
  const content = choices[0].message.content;

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    console.error('[metadata] Failed to parse LLM response as JSON, using fallback. Raw:', content.slice(0, 200));
    return { ...FALLBACK_METADATA, _metadata_parse_failed: true };
  }
}
