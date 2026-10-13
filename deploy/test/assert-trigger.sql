-- Fingerprint trigger behaviour on one brain. Run with -v schema=<brain schema>.
SET search_path = :schema;

-- A raw INSERT gets the fingerprint upsert_thought would give the same text.
INSERT INTO thoughts (content) VALUES ('  Smoke   Probe ');
DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = '  Smoke   Probe ')
     IS DISTINCT FROM encode(sha256(convert_to('smoke probe', 'UTF8')), 'hex')
  THEN RAISE EXCEPTION 'raw insert fingerprint does not match upsert_thought normalisation'; END IF;
END $$;

-- A content edit recomputes it.
UPDATE thoughts SET content = 'smoke probe edited' WHERE content = '  Smoke   Probe ';
DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = 'smoke probe edited')
     IS DISTINCT FROM encode(sha256(convert_to('smoke probe edited', 'UTF8')), 'hex')
  THEN RAISE EXCEPTION 'content update did not recompute the fingerprint'; END IF;
END $$;

-- A metadata-only edit never fills a NULL fingerprint, so a legacy duplicate
-- row stays editable.
ALTER TABLE thoughts DISABLE TRIGGER trg_thoughts_content_fingerprint;
INSERT INTO thoughts (content) VALUES ('smoke probe edited');
ALTER TABLE thoughts ENABLE TRIGGER trg_thoughts_content_fingerprint;
UPDATE thoughts SET metadata = '{"smoke": true}' WHERE content_fingerprint IS NULL AND content = 'smoke probe edited';
DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = 'smoke probe edited' AND metadata ? 'smoke') IS NOT NULL
  THEN RAISE EXCEPTION 'metadata-only update filled a NULL fingerprint'; END IF;
END $$;

-- A raw duplicate INSERT is rejected by the unique index.
DO $$ BEGIN
  INSERT INTO thoughts (content) VALUES ('SMOKE probe   edited');
  RAISE EXCEPTION 'raw duplicate insert was accepted';
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
