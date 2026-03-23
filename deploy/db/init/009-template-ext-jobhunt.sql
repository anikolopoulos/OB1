-- 009-template-ext-jobhunt.sql
-- Brain template extension: job hunt (companies, postings, applications, interviews, contacts).

-- ── Companies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.companies (
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

DROP TRIGGER IF EXISTS trg_companies_updated_at ON brain_template.companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON brain_template.companies
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Job Postings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.job_postings (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID        NOT NULL REFERENCES brain_template.companies(id) ON DELETE CASCADE,
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
    ON brain_template.job_postings (company_id);

-- ── Applications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.applications (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id      UUID        NOT NULL REFERENCES brain_template.job_postings(id) ON DELETE CASCADE,
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
    ON brain_template.applications (status);

CREATE INDEX IF NOT EXISTS idx_applications_job_posting_id
    ON brain_template.applications (job_posting_id);

DROP TRIGGER IF EXISTS trg_applications_updated_at ON brain_template.applications;
CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON brain_template.applications
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Interviews ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.interviews (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id    UUID        NOT NULL REFERENCES brain_template.applications(id) ON DELETE CASCADE,
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
    ON brain_template.interviews (application_id);

CREATE INDEX IF NOT EXISTS idx_interviews_scheduled
    ON brain_template.interviews (scheduled_at)
    WHERE status = 'scheduled';

-- ── Job Contacts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.job_contacts (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID        REFERENCES brain_template.companies(id) ON DELETE SET NULL,
    name                        TEXT        NOT NULL,
    title                       TEXT,
    email                       TEXT,
    phone                       TEXT,
    linkedin_url                TEXT,
    role_in_process             TEXT        CHECK (role_in_process IN (
                                                'recruiter', 'hiring_manager', 'referral',
                                                'interviewer', 'other'
                                            )),
    professional_crm_contact_id UUID,       -- soft ref to professional_contacts(id) in CRM extension
    notes                       TEXT,
    last_contacted              TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_contacts_company_id
    ON brain_template.job_contacts (company_id);
