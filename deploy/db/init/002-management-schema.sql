-- 002-management-schema.sql
-- Central management schema: brain registry, API keys, and Slack channel mappings.

CREATE SCHEMA IF NOT EXISTS management;

-- ── Brains ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS management.brains (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        UNIQUE NOT NULL,
    schema_name   TEXT        UNIQUE NOT NULL,
    display_name  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

-- ── Brain API Keys ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS management.brain_keys (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brain_id      UUID        NOT NULL REFERENCES management.brains(id) ON DELETE CASCADE,
    key_hash      TEXT        NOT NULL,
    key_prefix    TEXT        NOT NULL,
    label         TEXT,
    last_used_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at    TIMESTAMPTZ
);

-- Fast lookup of active (non-revoked) keys by hash
CREATE INDEX IF NOT EXISTS idx_brain_keys_active_hash
    ON management.brain_keys (key_hash)
    WHERE revoked_at IS NULL;

-- List all keys for a given brain
CREATE INDEX IF NOT EXISTS idx_brain_keys_brain_id
    ON management.brain_keys (brain_id);

-- ── Slack Channel Mappings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS management.slack_channels (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brain_id         UUID        NOT NULL REFERENCES management.brains(id) ON DELETE CASCADE,
    slack_channel_id TEXT        UNIQUE NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
