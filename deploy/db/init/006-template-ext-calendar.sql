-- 006-template-ext-calendar.sql
-- Brain template extension: family calendar (members, activities, important dates).

-- ── Family Members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.family_members (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    relationship  TEXT,
    birth_date    DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Activities ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.activities (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id  UUID        REFERENCES brain_template.family_members(id) ON DELETE CASCADE,
    title             TEXT        NOT NULL,
    activity_type     TEXT,
    day_of_week       TEXT,
    start_time        TIME,
    end_time          TIME,
    start_date        DATE,
    end_date          DATE,
    location          TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_day_of_week
    ON brain_template.activities (day_of_week);

CREATE INDEX IF NOT EXISTS idx_activities_family_member_id
    ON brain_template.activities (family_member_id);

-- ── Important Dates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.important_dates (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id      UUID        REFERENCES brain_template.family_members(id) ON DELETE CASCADE,
    title                 TEXT        NOT NULL,
    date_value            DATE        NOT NULL,
    recurring_yearly      BOOLEAN     NOT NULL DEFAULT false,
    reminder_days_before  INT         NOT NULL DEFAULT 7,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_important_dates_family_member_id
    ON brain_template.important_dates (family_member_id);

CREATE INDEX IF NOT EXISTS idx_important_dates_date_value
    ON brain_template.important_dates (date_value);
