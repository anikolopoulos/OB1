-- 008-template-ext-crm.sql
-- Brain template extension: professional CRM (contacts, interactions, opportunities).

-- ── Professional Contacts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.professional_contacts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    company          TEXT,
    title            TEXT,
    email            TEXT,
    phone            TEXT,
    linkedin_url     TEXT,
    how_we_met       TEXT,
    tags             TEXT[],
    notes            TEXT,
    last_contacted   TIMESTAMPTZ,
    follow_up_date   DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_contacts_last_contacted
    ON brain_template.professional_contacts (last_contacted);

-- Partial index: only contacts that have a pending follow-up
CREATE INDEX IF NOT EXISTS idx_professional_contacts_follow_up
    ON brain_template.professional_contacts (follow_up_date)
    WHERE follow_up_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_professional_contacts_updated_at ON brain_template.professional_contacts;
CREATE TRIGGER trg_professional_contacts_updated_at
    BEFORE UPDATE ON brain_template.professional_contacts
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Contact Interactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.contact_interactions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id        UUID        NOT NULL REFERENCES brain_template.professional_contacts(id) ON DELETE CASCADE,
    interaction_type  TEXT        NOT NULL
                                  CHECK (interaction_type IN (
                                      'meeting', 'email', 'call', 'coffee',
                                      'event', 'linkedin', 'other'
                                  )),
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary           TEXT,
    follow_up_needed  BOOLEAN     NOT NULL DEFAULT false,
    follow_up_notes   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_interactions_contact_id
    ON brain_template.contact_interactions (contact_id);

-- ── Opportunities ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.opportunities (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id          UUID          REFERENCES brain_template.professional_contacts(id) ON DELETE SET NULL,
    title               TEXT          NOT NULL,
    description         TEXT,
    stage               TEXT          NOT NULL DEFAULT 'identified'
                                      CHECK (stage IN (
                                          'identified', 'in_conversation', 'proposal',
                                          'negotiation', 'won', 'lost'
                                      )),
    value               DECIMAL(12,2),
    expected_close_date DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_stage
    ON brain_template.opportunities (stage);

DROP TRIGGER IF EXISTS trg_opportunities_updated_at ON brain_template.opportunities;
CREATE TRIGGER trg_opportunities_updated_at
    BEFORE UPDATE ON brain_template.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Auto-update last_contacted when an interaction is logged ────────────────
CREATE OR REPLACE FUNCTION brain_template.update_last_contacted()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE brain_template.professional_contacts
    SET
        last_contacted = NEW.occurred_at,
        updated_at     = now()
    WHERE id = NEW.contact_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interaction_update_last_contacted ON brain_template.contact_interactions;
CREATE TRIGGER trg_interaction_update_last_contacted
    AFTER INSERT ON brain_template.contact_interactions
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_last_contacted();
