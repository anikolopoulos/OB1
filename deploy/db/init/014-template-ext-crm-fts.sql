-- 014-template-ext-crm-fts.sql
-- CRM full-text search: GIN-indexed tsvector on contacts + interactions,
-- plus a ranked-search RPC. Adapted from upstream commit dd0e700 (Pinto)
-- for our schema-per-brain isolation model (no user_id filter — the brain
-- schema is the tenant boundary).

-- ── Generated FTS column on professional_contacts ──────────────────────────
ALTER TABLE brain_template.professional_contacts
    ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(name, '')       || ' ' ||
            coalesce(company, '')    || ' ' ||
            coalesce(title, '')      || ' ' ||
            coalesce(notes, '')      || ' ' ||
            coalesce(how_we_met, '')
        )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_professional_contacts_fts
    ON brain_template.professional_contacts USING GIN (fts);

-- ── Generated FTS column on contact_interactions ───────────────────────────
ALTER TABLE brain_template.contact_interactions
    ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(summary, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_contact_interactions_fts
    ON brain_template.contact_interactions USING GIN (fts);

-- ── Ranked full-text search RPC ────────────────────────────────────────────
-- Called by the crm_search_contacts MCP tool. Returns ts_rank-ordered matches
-- with optional tag-array filtering. Brain isolation is handled by search_path
-- (set per request from the API key), so no tenant column is needed here.
CREATE OR REPLACE FUNCTION brain_template.crm_search_contacts_fts(
    search_query  TEXT,
    search_tags   TEXT[] DEFAULT NULL,
    max_results   INT    DEFAULT 20
)
RETURNS TABLE (
    id              UUID,
    name            TEXT,
    company         TEXT,
    title           TEXT,
    email           TEXT,
    phone           TEXT,
    linkedin_url    TEXT,
    how_we_met      TEXT,
    tags            TEXT[],
    notes           TEXT,
    last_contacted  TIMESTAMPTZ,
    follow_up_date  DATE,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    rank            REAL
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id, pc.name, pc.company, pc.title, pc.email,
        pc.phone, pc.linkedin_url, pc.how_we_met, pc.tags, pc.notes,
        pc.last_contacted, pc.follow_up_date, pc.created_at, pc.updated_at,
        ts_rank(pc.fts, to_tsquery('english', search_query)) AS rank
    FROM brain_template.professional_contacts pc
    WHERE pc.fts @@ to_tsquery('english', search_query)
      AND (search_tags IS NULL OR pc.tags @> search_tags)
    ORDER BY rank DESC
    LIMIT max_results;
END;
$$;
