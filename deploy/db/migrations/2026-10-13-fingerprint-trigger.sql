-- 2026-10-13-fingerprint-trigger.sql
-- Installs the write-time content fingerprint trigger (see
-- deploy/db/init/015-fingerprint-trigger.sql) on brain_template and on every
-- existing brain schema. Init scripts only run on first boot, so existing
-- databases need this once. Idempotent: safe to run more than once.
-- Adds a function and a trigger only; no rows are changed.

DO $$
DECLARE
    s TEXT;
BEGIN
    FOR s IN
        SELECT 'brain_template'
        UNION
        SELECT schema_name FROM management.brains
    LOOP
        IF to_regclass(format('%I.thoughts', s)) IS NULL THEN
            RAISE NOTICE 'skipping %: no thoughts table', s;
            CONTINUE;
        END IF;

        EXECUTE format($f$
            CREATE OR REPLACE FUNCTION %I.set_content_fingerprint()
            RETURNS TRIGGER AS $body$
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
            $body$ LANGUAGE plpgsql
        $f$, s);

        EXECUTE format('DROP TRIGGER IF EXISTS trg_thoughts_content_fingerprint ON %I.thoughts', s);
        EXECUTE format(
            'CREATE TRIGGER trg_thoughts_content_fingerprint
                 BEFORE INSERT OR UPDATE ON %I.thoughts
                 FOR EACH ROW
                 EXECUTE FUNCTION %I.set_content_fingerprint()',
            s, s
        );
        RAISE NOTICE 'installed fingerprint trigger on %', s;
    END LOOP;
END;
$$;

-- Read-only check after running: rows whose stored fingerprint no longer
-- matches their content (edited through the REST API before this trigger).
-- Recomputing them could collide with another row, so review before fixing.
-- Run per brain schema:
--
-- SELECT count(*) FROM brain_<slug>.thoughts
--  WHERE content_fingerprint IS DISTINCT FROM encode(sha256(convert_to(
--        lower(trim(regexp_replace(content, '\s+', ' ', 'g'))), 'UTF8')), 'hex');
