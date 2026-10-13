-- 015-fingerprint-trigger.sql
-- Write-time content fingerprint: every INSERT gets a fingerprint and every
-- content change recomputes it, whatever the write path (raw INSERT from a
-- recipe or script, REST edit, MCP update). upsert_thought supplies its own
-- fingerprint and is unaffected.
-- Normalisation must stay identical to upsert_thought (011) so trigger
-- fingerprints line up with idx_thoughts_fingerprint.
-- A metadata-only UPDATE never touches the fingerprint, so legacy rows with a
-- NULL fingerprint stay editable even when their content duplicates another row.
-- Cloned to every new brain via clone_brain_schema(). Existing brains:
-- deploy/db/migrations/2026-10-13-fingerprint-trigger.sql.

CREATE OR REPLACE FUNCTION brain_template.set_content_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.content_fingerprint IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.content IS DISTINCT FROM OLD.content) THEN
        NEW.content_fingerprint := encode(sha256(convert_to(
            lower(trim(regexp_replace(NEW.content, '\s+', ' ', 'g'))),
            'UTF8'
        )), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_thoughts_content_fingerprint ON brain_template.thoughts;
CREATE TRIGGER trg_thoughts_content_fingerprint
    BEFORE INSERT OR UPDATE ON brain_template.thoughts
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.set_content_fingerprint();
