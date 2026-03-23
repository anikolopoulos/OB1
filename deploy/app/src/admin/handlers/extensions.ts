import type { Context } from 'hono';
import { withBrainSchema } from '../../db/with-schema.js';
import { findBrainBySlug } from './shared.js';
import { invalidateSchemaCache } from '../../mcp/server-factory.js';

// ── Extension DDL ─────────────────────────────────────────────────────────────
// Each extension's DDL creates tables that mirror what's in the brain_template.
// The DDL uses unqualified table names because withBrainSchema sets search_path.

const EXTENSION_DDL: Record<string, string> = {
  household: `
    CREATE TABLE IF NOT EXISTS household_items (
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
        ON household_items (category);

    CREATE TABLE IF NOT EXISTS household_vendors (
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
        ON household_vendors (service_type);
  `,

  maintenance: `
    CREATE TABLE IF NOT EXISTS maintenance_tasks (
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
        ON maintenance_tasks (next_due);

    CREATE TABLE IF NOT EXISTS maintenance_logs (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id       UUID          NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
        completed_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        performed_by  TEXT,
        cost          DECIMAL(10,2),
        notes         TEXT,
        next_action   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_task_completed
        ON maintenance_logs (task_id, completed_at DESC);
  `,

  calendar: `
    CREATE TABLE IF NOT EXISTS family_members (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name          TEXT        NOT NULL,
        relationship  TEXT,
        birth_date    DATE,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activities (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        family_member_id  UUID        REFERENCES family_members(id) ON DELETE CASCADE,
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
        ON activities (day_of_week);
    CREATE INDEX IF NOT EXISTS idx_activities_family_member_id
        ON activities (family_member_id);

    CREATE TABLE IF NOT EXISTS important_dates (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        family_member_id      UUID        REFERENCES family_members(id) ON DELETE CASCADE,
        title                 TEXT        NOT NULL,
        date_value            DATE        NOT NULL,
        recurring_yearly      BOOLEAN     NOT NULL DEFAULT false,
        reminder_days_before  INT         NOT NULL DEFAULT 7,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_important_dates_family_member_id
        ON important_dates (family_member_id);
    CREATE INDEX IF NOT EXISTS idx_important_dates_date_value
        ON important_dates (date_value);
  `,

  meals: `
    CREATE TABLE IF NOT EXISTS recipes (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name                TEXT        NOT NULL,
        cuisine             TEXT,
        prep_time_minutes   INT,
        cook_time_minutes   INT,
        servings            INT,
        ingredients         JSONB       NOT NULL DEFAULT '[]',
        instructions        JSONB       NOT NULL DEFAULT '[]',
        tags                TEXT[],
        rating              INT         CHECK (rating >= 1 AND rating <= 5),
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_recipes_tags_gin
        ON recipes USING gin (tags);

    CREATE TABLE IF NOT EXISTS meal_plans (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start  DATE        NOT NULL,
        day_of_week TEXT        NOT NULL,
        meal_type   TEXT        NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
        recipe_id   UUID        REFERENCES recipes(id) ON DELETE SET NULL,
        custom_meal TEXT,
        servings    INT,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start
        ON meal_plans (week_start);

    CREATE TABLE IF NOT EXISTS shopping_lists (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start  DATE        NOT NULL,
        items       JSONB       NOT NULL DEFAULT '[]',
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_shopping_lists_week_start
        ON shopping_lists (week_start);
  `,

  crm: `
    CREATE TABLE IF NOT EXISTS professional_contacts (
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
        ON professional_contacts (last_contacted);
    CREATE INDEX IF NOT EXISTS idx_professional_contacts_follow_up
        ON professional_contacts (follow_up_date)
        WHERE follow_up_date IS NOT NULL;

    CREATE TABLE IF NOT EXISTS contact_interactions (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id        UUID        NOT NULL REFERENCES professional_contacts(id) ON DELETE CASCADE,
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
        ON contact_interactions (contact_id);

    CREATE TABLE IF NOT EXISTS opportunities (
        id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id          UUID          REFERENCES professional_contacts(id) ON DELETE SET NULL,
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
        ON opportunities (stage);
  `,

  jobhunt: `
    CREATE TABLE IF NOT EXISTS companies (
        id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name              TEXT          NOT NULL,
        industry          TEXT,
        website           TEXT,
        size              TEXT          CHECK (size IN ('startup', 'mid-market', 'enterprise')),
        location          TEXT,
        remote_policy     TEXT          CHECK (remote_policy IN ('remote', 'hybrid', 'onsite')),
        notes             TEXT,
        glassdoor_rating  DECIMAL(2,1)  CHECK (glassdoor_rating >= 1.0 AND glassdoor_rating <= 5.0),
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS job_postings (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title             TEXT        NOT NULL,
        url               TEXT,
        salary_min        INT,
        salary_max        INT,
        salary_currency   TEXT        NOT NULL DEFAULT 'USD',
        requirements      TEXT[],
        nice_to_haves     TEXT[],
        notes             TEXT,
        source            TEXT        CHECK (source IN (
                                          'linkedin', 'company-site', 'referral',
                                          'recruiter', 'other'
                                      )),
        posted_date       DATE,
        closing_date      DATE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_job_postings_company_id
        ON job_postings (company_id);

    CREATE TABLE IF NOT EXISTS applications (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        job_posting_id      UUID        NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
        status              TEXT        NOT NULL DEFAULT 'applied'
                                        CHECK (status IN (
                                            'draft', 'applied', 'screening', 'interviewing',
                                            'offer', 'accepted', 'rejected', 'withdrawn'
                                        )),
        applied_date        DATE,
        response_date       DATE,
        resume_version      TEXT,
        cover_letter_notes  TEXT,
        referral_contact    TEXT,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_applications_status
        ON applications (status);
    CREATE INDEX IF NOT EXISTS idx_applications_job_posting_id
        ON applications (job_posting_id);

    CREATE TABLE IF NOT EXISTS interviews (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id    UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        interview_type    TEXT        NOT NULL
                                      CHECK (interview_type IN (
                                          'phone_screen', 'technical', 'behavioral',
                                          'system_design', 'hiring_manager', 'team', 'final'
                                      )),
        scheduled_at      TIMESTAMPTZ,
        duration_minutes  INT,
        interviewer_name  TEXT,
        interviewer_title TEXT,
        status            TEXT        NOT NULL DEFAULT 'scheduled'
                                      CHECK (status IN (
                                          'scheduled', 'completed', 'cancelled', 'no_show'
                                      )),
        notes             TEXT,
        feedback          TEXT,
        rating            INT         CHECK (rating >= 1 AND rating <= 5),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_interviews_application_id
        ON interviews (application_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_scheduled
        ON interviews (scheduled_at)
        WHERE status = 'scheduled';

    CREATE TABLE IF NOT EXISTS job_contacts (
        id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id                  UUID        REFERENCES companies(id) ON DELETE SET NULL,
        name                        TEXT        NOT NULL,
        title                       TEXT,
        email                       TEXT,
        phone                       TEXT,
        linkedin_url                TEXT,
        role_in_process             TEXT        CHECK (role_in_process IN (
                                                    'recruiter', 'hiring_manager', 'referral',
                                                    'interviewer', 'other'
                                                )),
        professional_crm_contact_id UUID,
        notes                       TEXT,
        last_contacted              TIMESTAMPTZ,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_job_contacts_company_id
        ON job_contacts (company_id);
  `,
};

// ── POST /admin/brains/:slug/extensions/:name ─────────────────────────────────
export async function installExtension(c: Context): Promise<Response> {
  const name = c.req.param('name');

  const ddl = EXTENSION_DDL[name as string];
  if (!ddl) {
    return c.json(
      {
        error: `Unknown extension: "${name}". Available: ${Object.keys(EXTENSION_DDL).join(', ')}`,
      },
      400,
    );
  }

  const brain = await findBrainBySlug(c.req.param('slug')!);

  if (!brain) {
    return c.json({ error: 'Brain not found' }, 404);
  }

  const schemaName = brain.schema_name as string;

  await withBrainSchema(schemaName, async (query) => {
    await query(ddl);
  });

  // Invalidate the schema table cache so MCP immediately sees the new extension tools
  invalidateSchemaCache(schemaName);

  return c.json({ installed: name, schema: schemaName });
}
