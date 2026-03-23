-- 005-template-ext-maintenance.sql
-- Brain template extension: home maintenance tasks and logs.

-- ── Maintenance Tasks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.maintenance_tasks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    category        TEXT,
    frequency_days  INT,
    last_completed  TIMESTAMPTZ,
    next_due        TIMESTAMPTZ,
    priority        TEXT        NOT NULL DEFAULT 'medium'
                                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_next_due
    ON brain_template.maintenance_tasks (next_due);

DROP TRIGGER IF EXISTS trg_maintenance_tasks_updated_at ON brain_template.maintenance_tasks;
CREATE TRIGGER trg_maintenance_tasks_updated_at
    BEFORE UPDATE ON brain_template.maintenance_tasks
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Maintenance Logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.maintenance_logs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id       UUID          NOT NULL REFERENCES brain_template.maintenance_tasks(id) ON DELETE CASCADE,
    completed_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    performed_by  TEXT,
    cost          DECIMAL(10,2),
    notes         TEXT,
    next_action   TEXT
);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_task_completed
    ON brain_template.maintenance_logs (task_id, completed_at DESC);

-- ── Auto-update task after a maintenance log is inserted ────────────────────
CREATE OR REPLACE FUNCTION brain_template.update_task_after_maintenance_log()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE brain_template.maintenance_tasks
    SET
        last_completed = NEW.completed_at,
        next_due       = CASE
                            WHEN frequency_days IS NOT NULL
                            THEN NEW.completed_at + (frequency_days || ' days')::interval
                            ELSE next_due
                         END,
        updated_at     = now()
    WHERE id = NEW.task_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maintenance_log_update_task ON brain_template.maintenance_logs;
CREATE TRIGGER trg_maintenance_log_update_task
    AFTER INSERT ON brain_template.maintenance_logs
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_task_after_maintenance_log();
