import { config } from '../config.js';

/**
 * Sends a request to the LiteLLM API and returns the parsed JSON response.
 * Throws on non-2xx status codes with the response body in the error message.
 */
export async function litellmRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.LITELLM_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.LITELLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Log the full error internally but do not include the raw body in the
    // thrown error — it may contain reflected API keys or secrets.
    console.error(`[litellm] ${path} failed (${response.status}):`, text.slice(0, 500));
    throw new Error(`LiteLLM ${path} failed (${response.status})`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}
