-- After the migration has run (twice) on brain_legacy.
SET search_path = brain_legacy;

DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = 'edited text')
     IS DISTINCT FROM encode(sha256(convert_to('edited text', 'UTF8')), 'hex')
  THEN RAISE EXCEPTION 'stale fingerprint was not repaired'; END IF;
END $$;

DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = 'TAKEN') <> 'stale-and-taken'
  THEN RAISE EXCEPTION 'stale fingerprint whose corrected value is taken was changed'; END IF;
END $$;

DO $$ BEGIN
  IF (SELECT content_fingerprint FROM thoughts WHERE content = 'legacy null') IS NOT NULL
  THEN RAISE EXCEPTION 'migration filled a NULL fingerprint'; END IF;
END $$;
