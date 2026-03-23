import { config } from '../config.js';
import { litellmRequest } from './litellm-client.js';

export const METADATA_SYSTEM_PROMPT = `You are a metadata extraction assistant. Given a thought or note, extract structured metadata as JSON with these fields:
- people: string[] — names of people mentioned
- action_items: string[] — any tasks or action items
- dates_mentioned: string[] — any dates or time references
- topics: string[] — key topics or themes
- type: string — one of: "observation", "idea", "task", "meeting_note", "reflection", "reference"

Return ONLY valid JSON, no additional text.`;

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
    console.warn('[metadata] Failed to parse LLM response as JSON, using fallback. Raw:', content.slice(0, 200));
    return { ...FALLBACK_METADATA, _metadata_parse_failed: true };
  }
}
