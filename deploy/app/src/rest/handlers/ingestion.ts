import { z } from 'zod';
import type { Context } from 'hono';
import { brainQuery } from '../router.js';
import { withBrainSchema } from '../../db/with-schema.js';
import { extractThoughts, classifyItems } from '../../ai/extraction.js';
import { getEmbedding } from '../../ai/embeddings.js';
import { extractMetadata } from '../../ai/metadata.js';

// ── GET /api/ingestion-jobs ───────────────────────────────────────────────────
export async function listIngestionJobs(c: Context): Promise<Response> {
  const result = await brainQuery(
    c,
    `SELECT * FROM ingestion_jobs ORDER BY created_at DESC LIMIT 50`,
  );

  return c.json({ jobs: result.rows, count: result.rows.length });
}

// ── POST /api/ingest ──────────────────────────────────────────────────────────
const ingestBodySchema = z.object({
  text: z.string().min(1).max(50000),
  dry_run: z.boolean().default(true),
  source_label: z.string().optional(),
});

export async function ingestHandler(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ingestBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', details: parsed.error.flatten() }, 400);
  }

  const { text, dry_run, source_label = null } = parsed.data;

  const brain = c.get('brain') as { schemaName: string };
  const { schemaName } = brain;

  // 1. Create the job row with status='extracting'
  const jobResult = await brainQuery(
    c,
    `INSERT INTO ingestion_jobs (source_label, status)
     VALUES ($1, 'extracting')
     RETURNING id`,
    [source_label],
  );

  const jobId = (jobResult.rows[0] as { id: string }).id;

  try {
    // 2. Extract thoughts via LLM
    const extractedItems = await extractThoughts(text);

    // 3. Classify items via fingerprint check
    const classifiedItems = await classifyItems(schemaName, extractedItems);

    // 4. Batch-insert all items into ingestion_items (single query, single connection)
    if (classifiedItems.length > 0) {
      const params: unknown[] = [];
      const rows: string[] = [];
      for (let i = 0; i < classifiedItems.length; i++) {
        const item = classifiedItems[i];
        const off = i * 8;
        rows.push(`($${off + 1}::uuid, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7}, $${off + 8})`);
        params.push(jobId, item.content, item.type, item.fingerprint, item.action, item.reason, item.similarity, item.matched_thought_id);
      }
      await brainQuery(
        c,
        `INSERT INTO ingestion_items (job_id, content, type, fingerprint, action, reason, similarity, matched_thought_id)
         VALUES ${rows.join(', ')}`,
        params,
      );
    }

    const extractedCount = classifiedItems.length;
    const addItems = classifiedItems.filter((i) => i.action === 'add');
    const skipCount = classifiedItems.filter((i) => i.action === 'skip').length;

    if (dry_run) {
      // 5a. dry_run=true → mark complete without committing thoughts
      await brainQuery(
        c,
        `UPDATE ingestion_jobs
            SET status = 'dry_run_complete',
                extracted_count = $2,
                skipped_count = $3,
                updated_at = now()
          WHERE id = $1::uuid`,
        [jobId, extractedCount, skipCount],
      );

      return c.json({ job_id: jobId, status: 'dry_run_complete', extracted_count: extractedCount });
    }

    // 5b. dry_run=false → immediately commit all 'add' items
    let committedCount = 0;

    for (const item of addItems) {
      try {
        const [embedding, metadata] = await Promise.all([
          getEmbedding(item.content),
          extractMetadata(item.content),
        ]);

        await brainQuery(
          c,
          `SELECT * FROM upsert_thought($1, $2::vector, $3::jsonb)`,
          [
            item.content,
            JSON.stringify(embedding),
            JSON.stringify({ ...metadata, source: 'ingestion', ingestion_job_id: jobId }),
          ],
        );

        // Mark item as committed
        await brainQuery(
          c,
          `UPDATE ingestion_items SET status = 'committed' WHERE job_id = $1::uuid AND fingerprint = $2`,
          [jobId, item.fingerprint],
        );

        committedCount++;
      } catch (err) {
        console.error(`[ingestion] Failed to commit item (fingerprint=${item.fingerprint}):`, err);
      }
    }

    // Mark skipped items
    await brainQuery(
      c,
      `UPDATE ingestion_items SET status = 'skipped' WHERE job_id = $1::uuid AND action = 'skip'`,
      [jobId],
    );

    await brainQuery(
      c,
      `UPDATE ingestion_jobs
          SET status = 'complete',
              extracted_count = $2,
              added_count = $3,
              skipped_count = $4,
              completed_at = now(),
              updated_at = now()
        WHERE id = $1::uuid`,
      [jobId, extractedCount, committedCount, skipCount],
    );

    return c.json({ job_id: jobId, status: 'complete', extracted_count: extractedCount });
  } catch (err) {
    console.error('[ingestion] Pipeline failed for job', jobId, err);

    await brainQuery(
      c,
      `UPDATE ingestion_jobs SET status = 'failed', updated_at = now() WHERE id = $1::uuid`,
      [jobId],
    ).catch(() => {
      // Best-effort update; don't mask the original error
    });

    return c.json({ error: 'Ingestion pipeline failed', job_id: jobId }, 500);
  }
}

// ── GET /api/ingestion-jobs/:id ───────────────────────────────────────────────
export async function getIngestionJob(c: Context): Promise<Response> {
  const id = c.req.param('id');

  const jobResult = await brainQuery(
    c,
    `SELECT * FROM ingestion_jobs WHERE id = $1::uuid`,
    [id],
  );

  if (jobResult.rows.length === 0) {
    return c.json({ error: 'Ingestion job not found' }, 404);
  }

  const itemsResult = await brainQuery(
    c,
    `SELECT * FROM ingestion_items WHERE job_id = $1::uuid ORDER BY created_at ASC`,
    [id],
  );

  return c.json({ job: jobResult.rows[0], items: itemsResult.rows });
}

// ── POST /api/ingestion-jobs/:id/execute ─────────────────────────────────────
export async function executeIngestionJob(c: Context): Promise<Response> {
  const id = c.req.param('id');

  const brain = c.get('brain') as { schemaName: string };

  // Run the entire execute operation on a single connection
  const jobResult = await withBrainSchema(brain.schemaName, async (query) => {
    // Concurrency guard: only transition from dry_run_complete → executing
    const lockResult = await query(
      `UPDATE ingestion_jobs
          SET status = 'executing', updated_at = now()
        WHERE id = $1::uuid AND status = 'dry_run_complete'
        RETURNING id`,
      [id],
    );

    if (lockResult.rows.length === 0) {
      return null; // signals 409
    }

    // Fetch pending 'add' items
    const itemsResult = await query(
      `SELECT id, content, type, fingerprint FROM ingestion_items
        WHERE job_id = $1::uuid AND action = 'add' AND status = 'pending'
        ORDER BY created_at ASC`,
      [id],
    );

    const items = itemsResult.rows as Array<{
      id: string;
      content: string;
      type: string;
      fingerprint: string;
    }>;

    let committedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      try {
        // Embedding + metadata calls go to LiteLLM (external, outside DB connection)
        const [embedding, metadata] = await Promise.all([
          getEmbedding(item.content),
          extractMetadata(item.content),
        ]);

        await query(
          `SELECT * FROM upsert_thought($1, $2::vector, $3::jsonb)`,
          [
            item.content,
            JSON.stringify(embedding),
            JSON.stringify({ ...metadata, source: 'ingestion', ingestion_job_id: id }),
          ],
        );

        await query(
          `UPDATE ingestion_items SET status = 'committed' WHERE id = $1::uuid`,
          [item.id],
        );

        committedCount++;
      } catch (err) {
        console.error(`[ingestion] execute: failed to commit item ${item.id}:`, err);
        await query(
          `UPDATE ingestion_items SET status = 'skipped' WHERE id = $1::uuid`,
          [item.id],
        ).catch(() => {});
        skippedCount++;
      }
    }

    // Count pre-existing 'skip' action items toward skipped total
    const skipActionResult = await query(
      `SELECT count(*)::int AS n FROM ingestion_items WHERE job_id = $1::uuid AND action = 'skip'`,
      [id],
    );
    const actionSkipCount = (skipActionResult.rows[0] as { n: number }).n;

    await query(
      `UPDATE ingestion_jobs
          SET status = 'complete',
              added_count = $2,
              skipped_count = $3,
              completed_at = now(),
              updated_at = now()
        WHERE id = $1::uuid`,
      [id, committedCount, skippedCount + actionSkipCount],
    );

    return await query(`SELECT * FROM ingestion_jobs WHERE id = $1::uuid`, [id]);
  });

  if (jobResult === null) {
    return c.json({ error: 'Job not found or not in dry_run_complete state' }, 409);
  }

  const itemsDetail = await brainQuery(
    c,
    `SELECT * FROM ingestion_items WHERE job_id = $1::uuid ORDER BY created_at ASC`,
    [id],
  );

  return c.json({ job: jobResult.rows[0], items: itemsDetail.rows });
}
