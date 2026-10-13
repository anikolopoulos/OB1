-- 2026-10-13-fingerprint-trigger.sql
-- Installs the write-time content fingerprint trigger (see
-- deploy/db/init/015-fingerprint-trigger.sql) on brain_template and on every
-- existing brain schema. Init scripts only run on first boot, so existing
-- databases need this once. Idempotent: safe to run more than once.
--
-- Run with: psql -v ON_ERROR_STOP=1 ... < this file
--
-- Locking: CREATE OR REPLACE TRIGGER takes SHARE ROW EXCLUSIVE, which pauses
-- writes to each thoughts table but not reads. lock_timeout makes the run fail
-- (and roll back as a whole) instead of queueing behind a long reader such as
-- pg_dump; re-run it when that reader is done.
--
-- Part 2 repairs stale fingerprints (rows whose content was edited through the
-- REST API before this trigger existed). It skips a row when its corrected
-- fingerprint is already taken, or when several stale rows would correct to the
-- same value (repairing both would break the unique index and roll back the
-- whole run). Each repaired row's updated_at moves to the migration time
-- (trg_thoughts_updated_at).

SET lock_timeout = '3s';

DO $$
DECLARE
    s TEXT;
    repaired BIGINT;
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

        -- Part 1: function + trigger
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

        EXECUTE format(
            'CREATE OR REPLACE TRIGGER trg_thoughts_content_fingerprint
                 BEFORE INSERT OR UPDATE ON %I.thoughts
                 FOR EACH ROW
                 EXECUTE FUNCTION %I.set_content_fingerprint()',
            s, s
        );

        -- Part 2: repair stale fingerprints. Content is unchanged, so the
        -- trigger leaves the explicit value alone.
        EXECUTE format($u$
            WITH fixed AS (
                SELECT id, encode(sha256(convert_to(
                           lower(trim(regexp_replace(content, '\s+', ' ', 'g'))),
                           'UTF8')), 'hex') AS fp
                  FROM %I.thoughts
                 WHERE content_fingerprint IS NOT NULL
            )
            UPDATE %I.thoughts t
               SET content_fingerprint = f.fp
              FROM fixed f
             WHERE t.id = f.id
               AND t.content_fingerprint <> f.fp
               AND NOT EXISTS (SELECT 1 FROM %I.thoughts o
                                WHERE o.content_fingerprint = f.fp AND o.id <> t.id)
               AND f.fp NOT IN (SELECT fp FROM fixed GROUP BY fp HAVING count(*) > 1)
        $u$, s, s, s);
        GET DIAGNOSTICS repaired = ROW_COUNT;

        RAISE NOTICE '%: trigger installed, % stale fingerprint(s) repaired', s, repaired;
    END LOOP;
END;
$$;

RESET lock_timeout;

-- Read-only checks after running (per brain schema):
--
-- Stale fingerprints left (corrected value collides with another row; review by hand):
--   SELECT count(*) FROM brain_<slug>.thoughts
--    WHERE content_fingerprint IS NOT NULL
--      AND content_fingerprint <> encode(sha256(convert_to(
--          lower(trim(regexp_replace(content, '\s+', ' ', 'g'))), 'UTF8')), 'hex');
--
-- Missing fingerprints (rows from before fingerprinting; see
-- recipes/fingerprint-dedup-backfill):
--   SELECT count(*) FROM brain_<slug>.thoughts WHERE content_fingerprint IS NULL;
--
-- Rollback (fingerprints the trigger already wrote are correct and can stay):
--   SET lock_timeout = '3s';
--   DO $$ DECLARE s text; BEGIN
--     FOR s IN SELECT 'brain_template' UNION SELECT schema_name FROM management.brains LOOP
--       IF to_regclass(format('%I.thoughts', s)) IS NOT NULL THEN
--         EXECUTE format('DROP TRIGGER IF EXISTS trg_thoughts_content_fingerprint ON %I.thoughts', s);
--         EXECUTE format('DROP FUNCTION IF EXISTS %I.set_content_fingerprint()', s);
--       END IF;
--     END LOOP;
--   END $$;
