-- 004-template-ext-household.sql
-- Brain template extension: household knowledge (items & vendors).

-- ── Household Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.household_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    category    TEXT,
    location    TEXT,
    details     JSONB       DEFAULT '{}',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_items_category
    ON brain_template.household_items (category);

DROP TRIGGER IF EXISTS trg_household_items_updated_at ON brain_template.household_items;
CREATE TRIGGER trg_household_items_updated_at
    BEFORE UPDATE ON brain_template.household_items
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Household Vendors ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.household_vendors (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    service_type  TEXT,
    phone         TEXT,
    email         TEXT,
    website       TEXT,
    notes         TEXT,
    rating        INT         CHECK (rating >= 1 AND rating <= 5),
    last_used     DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_vendors_service_type
    ON brain_template.household_vendors (service_type);
