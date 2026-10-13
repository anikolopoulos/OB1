-- A brain as it exists on production before 2026-10-13: no fingerprint
-- trigger, unique index named idx_thoughts_fingerprint, registered in
-- management.brains, holding a stale fingerprint (content edited after
-- capture), a stale one whose corrected value is taken, and a legacy NULL.
SELECT public.clone_brain_schema('brain_template', 'brain_legacy');
DROP TRIGGER trg_thoughts_content_fingerprint ON brain_legacy.thoughts;
ALTER INDEX brain_legacy.thoughts_content_fingerprint_idx RENAME TO idx_thoughts_fingerprint;
INSERT INTO management.brains (slug, display_name, schema_name) VALUES ('legacy', 'Legacy', 'brain_legacy');

SET search_path = brain_legacy;
SELECT * FROM upsert_thought('original text');
UPDATE thoughts SET content = 'edited text' WHERE content = 'original text';
SELECT * FROM upsert_thought('taken');
INSERT INTO thoughts (content, content_fingerprint) VALUES ('TAKEN', 'stale-and-taken');
INSERT INTO thoughts (content) VALUES ('legacy null');
