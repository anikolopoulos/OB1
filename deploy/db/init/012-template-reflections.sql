-- 012-template-reflections.sql
-- Brain template extension: decision traces and reflections linked to thoughts.

-- ── Reflections ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.reflections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thought_id      UUID NOT NULL REFERENCES brain_template.thoughts(id) ON DELETE CASCADE,
    trigger_context TEXT,
    options         JSONB NOT NULL DEFAULT '[]',
    factors         JSONB NOT NULL DEFAULT '[]',
    conclusion      TEXT,
    confidence      FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    reflection_type VARCHAR(50) NOT NULL DEFAULT 'decision_trace',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reflections_thought_id
    ON brain_template.reflections (thought_id);

-- Reuse the existing update_updated_at() trigger function from 003
DROP TRIGGER IF EXISTS trg_reflections_updated_at ON brain_template.reflections;
CREATE TRIGGER trg_reflections_updated_at
    BEFORE UPDATE ON brain_template.reflections
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();
