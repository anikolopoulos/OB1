-- 003-template-core.sql
-- Brain template schema: core thoughts table, vector search, and triggers.
-- This schema is cloned for every new brain via clone_brain_schema().

CREATE SCHEMA IF NOT EXISTS brain_template;

-- ── Thoughts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.thoughts (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT          NOT NULL,
    embedding   vector(1536),
    metadata    JSONB         NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate nearest-neighbor search on embeddings
CREATE INDEX IF NOT EXISTS idx_thoughts_embedding_hnsw
    ON brain_template.thoughts
    USING hnsw (embedding vector_cosine_ops);

-- GIN index for efficient JSONB containment queries on metadata
CREATE INDEX IF NOT EXISTS idx_thoughts_metadata_gin
    ON brain_template.thoughts
    USING gin (metadata);

-- Descending index on created_at for chronological listing
CREATE INDEX IF NOT EXISTS idx_thoughts_created_at_desc
    ON brain_template.thoughts (created_at DESC);

-- Slack dedup: ensure one thought per Slack timestamp within the slack source
CREATE UNIQUE INDEX IF NOT EXISTS idx_thoughts_slack_dedup
    ON brain_template.thoughts ((metadata->>'slack_ts'))
    WHERE metadata->>'source' = 'slack';

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION brain_template.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thoughts_updated_at ON brain_template.thoughts;
CREATE TRIGGER trg_thoughts_updated_at
    BEFORE UPDATE ON brain_template.thoughts
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Vector similarity search ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION brain_template.match_thoughts(
    query_embedding  vector(1536),
    match_threshold  float,
    match_count      int,
    filter           jsonb DEFAULT '{}'
)
RETURNS TABLE (
    id          UUID,
    content     TEXT,
    metadata    JSONB,
    similarity  float,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.content,
        t.metadata,
        1 - (t.embedding <=> query_embedding) AS similarity,
        t.created_at
    FROM brain_template.thoughts t
    WHERE
        t.embedding IS NOT NULL
        AND 1 - (t.embedding <=> query_embedding) >= match_threshold
        AND (filter = '{}' OR t.metadata @> filter)
    ORDER BY t.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
