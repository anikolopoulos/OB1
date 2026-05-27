import type { Context } from 'hono';
import { brainQuery } from '../router.js';
import { extractMetadata } from '../../ai/metadata.js';

const BATCH_CONCURRENCY = 5;

// POST /api/backfill-metadata
// Re-extracts metadata for all thoughts (or a filtered subset) using the current
// prompt. Uses selective JSONB merge so custom fields (source, importance, etc.)
// are preserved.
export async function backfillMetadataHandler(c: Context): Promise<Response> {
  // Optional query params
  const url = new URL(c.req.url);
  const typeFilter = url.searchParams.get('type');       // only re-process this type
  const dryRun = url.searchParams.get('dry_run') === 'true';

  // Fetch all thoughts (or filtered subset)
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (typeFilter) {
    conditions.push(`metadata @> $1::jsonb`);
    params.push(JSON.stringify({ type: typeFilter }));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await brainQuery(
    c,
    `SELECT id, content, metadata->>'type' AS old_type FROM thoughts ${where} ORDER BY created_at`,
    params,
  );

  const thoughts = result.rows as Array<{ id: string; content: string; old_type: string | null }>;

  if (thoughts.length === 0) {
    return c.json({ message: 'No thoughts to process', total: 0 });
  }

  // Track type changes for the summary
  const changes: Array<{ id: string; old_type: string | null; new_type: string }> = [];
  let processed = 0;
  let errors = 0;

  // Process in batches with bounded concurrency
  for (let i = 0; i < thoughts.length; i += BATCH_CONCURRENCY) {
    const batch = thoughts.slice(i, i + BATCH_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (thought) => {
        const meta = await extractMetadata(thought.content);
        const patch = {
          type: meta.type,
          people: meta.people,
          action_items: meta.action_items,
          dates_mentioned: meta.dates_mentioned,
          topics: meta.topics,
        };

        if (!dryRun) {
          await brainQuery(
            c,
            `UPDATE thoughts SET metadata = metadata || $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
            [thought.id, JSON.stringify(patch)],
          );
        }

        return {
          id: thought.id,
          old_type: thought.old_type,
          new_type: (meta.type as string) ?? 'observation',
        };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        processed++;
        if (r.value.old_type !== r.value.new_type) {
          changes.push(r.value);
        }
      } else {
        errors++;
        console.error('[backfill] Failed to process thought:', r.reason);
      }
    }
  }

  // Build type distribution summary
  const typeCounts: Record<string, number> = {};
  for (const ch of changes) {
    const key = `${ch.old_type ?? 'null'} → ${ch.new_type}`;
    typeCounts[key] = (typeCounts[key] ?? 0) + 1;
  }

  return c.json({
    total: thoughts.length,
    processed,
    errors,
    changed: changes.length,
    unchanged: processed - changes.length,
    dry_run: dryRun,
    type_transitions: typeCounts,
    details: changes,
  });
}
