-- 013-template-ingestion.sql
-- Brain template extension: ingestion jobs and per-item staging for bulk imports.

-- ── Ingestion Jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.ingestion_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_label    VARCHAR(255),
    status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','extracting','dry_run_complete','executing','complete','failed')),
    extracted_count INT NOT NULL DEFAULT 0,
    added_count     INT NOT NULL DEFAULT 0,
    skipped_count   INT NOT NULL DEFAULT 0,
    appended_count  INT NOT NULL DEFAULT 0,
    revised_count   INT NOT NULL DEFAULT 0,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at_desc
    ON brain_template.ingestion_jobs (created_at DESC);

DROP TRIGGER IF EXISTS trg_ingestion_jobs_updated_at ON brain_template.ingestion_jobs;
CREATE TRIGGER trg_ingestion_jobs_updated_at
    BEFORE UPDATE ON brain_template.ingestion_jobs
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Ingestion Items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.ingestion_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES brain_template.ingestion_jobs(id) ON DELETE CASCADE,
    content             TEXT NOT NULL,
    type                VARCHAR(50),
    fingerprint         TEXT,
    action              VARCHAR(30) NOT NULL DEFAULT 'add'
                        CHECK (action IN ('add','skip','create_revision','append_evidence')),
    reason              TEXT,
    similarity          FLOAT,
    matched_thought_id  UUID,
    status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','committed','skipped')),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_items_job_id
    ON brain_template.ingestion_items (job_id);
