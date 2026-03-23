import { config } from '../config.js';
import { litellmRequest } from './litellm-client.js';

export async function getEmbedding(text: string): Promise<number[]> {
  const data = await litellmRequest('/embeddings', {
    model: config.EMBEDDING_MODEL,
    input: text,
  });

  const embeddings = data.data as Array<{ embedding: number[] }> | undefined;
  if (!embeddings || embeddings.length === 0) {
    throw new Error(`LiteLLM embedding returned no data. Model: ${config.EMBEDDING_MODEL}`);
  }
  return embeddings[0].embedding;
}
