-- 011-upsert-function.sql
-- Content-fingerprint upsert: normalise content, SHA-256 hash, INSERT or merge.
-- Prevents duplicates during bulk imports and multi-source capture.
-- Cloned to every new brain via clone_brain_schema().

CREATE OR REPLACE FUNCTION brain_template.upsert_thought(
    p_content     TEXT,
    p_embedding   vector(1536) DEFAULT NULL,
    p_metadata    JSONB        DEFAULT '{}'::jsonb
)
RETURNS TABLE (id UUID, fingerprint TEXT, is_new BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
    v_fingerprint TEXT;
    v_id          UUID;
    v_is_new      BOOLEAN;
BEGIN
    -- Normalise then SHA-256
    v_fingerprint := encode(sha256(convert_to(
        lower(trim(regexp_replace(p_content, '\s+', ' ', 'g'))),
        'UTF8'
    )), 'hex');

    INSERT INTO thoughts (content, content_fingerprint, embedding, metadata)
    VALUES (p_content, v_fingerprint, p_embedding, p_metadata)
    ON CONFLICT (content_fingerprint) WHERE content_fingerprint IS NOT NULL
    DO UPDATE SET
        updated_at = now(),
        metadata   = thoughts.metadata || EXCLUDED.metadata
    RETURNING thoughts.id,
              (xmax = 0) -- true when INSERT, false when UPDATE (conflict)
    INTO v_id, v_is_new;

    RETURN QUERY SELECT v_id, v_fingerprint, v_is_new;
END;
$$;
