import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult, textResult, errorResult } from './tool-helpers.js';

export const jobHunt: ExtensionDefinition = {
  name: 'job-hunt',
  requiredTables: ['companies', 'job_postings', 'applications', 'interviews', 'job_contacts'],
  register(server, ctx) {
    server.tool(
      'add_company',
      'Add a target company to your job search tracker',
      {
        name: z.string().describe('Company name'),
        industry: z.string().optional().describe('Industry'),
        website: z.string().optional().describe('Company website'),
        size: z.enum(['startup', 'mid-market', 'enterprise']).optional().describe('Company size'),
        location: z.string().optional().describe('Location'),
        remote_policy: z.enum(['remote', 'hybrid', 'onsite']).optional().describe('Remote policy'),
        notes: z.string().optional().describe('Notes about the company'),
        glassdoor_rating: z.number().optional().describe('Glassdoor rating (1.0-5.0)'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO companies
             (name, industry, website, size, location, remote_policy, notes, glassdoor_rating)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            args.name,
            args.industry ?? null,
            args.website ?? null,
            args.size ?? null,
            args.location ?? null,
            args.remote_policy ?? null,
            args.notes ?? null,
            args.glassdoor_rating ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'add_job_posting',
      'Add a job posting at a tracked company',
      {
        company_id: z.string().describe('UUID of the company'),
        title: z.string().describe('Job title'),
        url: z.string().optional().describe('URL to the posting'),
        salary_min: z.number().optional().describe('Minimum salary'),
        salary_max: z.number().optional().describe('Maximum salary'),
        salary_currency: z.string().optional().default('USD').describe('Currency code'),
        requirements: z.array(z.string()).optional().describe('Key requirements'),
        nice_to_haves: z.array(z.string()).optional().describe('Nice-to-have qualifications'),
        source: z
          .enum(['linkedin', 'company-site', 'referral', 'recruiter', 'other'])
          .optional()
          .describe('Where you found the posting'),
        notes: z.string().optional().describe('Notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO job_postings
             (company_id, title, url, salary_min, salary_max, salary_currency,
              requirements, nice_to_haves, source, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            args.company_id,
            args.title,
            args.url ?? null,
            args.salary_min ?? null,
            args.salary_max ?? null,
            args.salary_currency,
            args.requirements ?? null,
            args.nice_to_haves ?? null,
            args.source ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'track_application',
      'Create or update a job application',
      {
        id: z.string().optional().describe('UUID of existing application to update (omit to create)'),
        job_posting_id: z.string().optional().describe('UUID of the job posting (required for new)'),
        status: z
          .enum(['draft', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'])
          .optional()
          .describe('Application status'),
        applied_date: z.string().optional().describe('Date applied (YYYY-MM-DD)'),
        resume_version: z.string().optional().describe('Which resume version was used'),
        cover_letter_notes: z.string().optional().describe('Cover letter key points'),
        referral_contact: z.string().optional().describe('Name of referral contact'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        if (args.id) {
          const setClauses: string[] = ['updated_at = now()'];
          const values: unknown[] = [];
          let idx = 1;

          if (args.status) { setClauses.push(`status = $${idx++}`); values.push(args.status); }
          if (args.applied_date) { setClauses.push(`applied_date = $${idx++}`); values.push(args.applied_date); }
          if (args.resume_version) { setClauses.push(`resume_version = $${idx++}`); values.push(args.resume_version); }
          if (args.cover_letter_notes !== undefined) { setClauses.push(`cover_letter_notes = $${idx++}`); values.push(args.cover_letter_notes); }
          if (args.referral_contact !== undefined) { setClauses.push(`referral_contact = $${idx++}`); values.push(args.referral_contact); }
          if (args.notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(args.notes); }

          if (setClauses.length <= 1) {
            return textResult('No fields to update');
          }

          values.push(args.id);
          const { rows } = await ctx.query(
            `UPDATE applications SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
            values,
          );
          return jsonResult(rows[0]);
        }

        if (!args.job_posting_id) {
          return errorResult('job_posting_id is required when creating a new application');
        }

        const { rows } = await ctx.query(
          `INSERT INTO applications
             (job_posting_id, status, applied_date, resume_version, cover_letter_notes, referral_contact, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            args.job_posting_id,
            args.status ?? 'applied',
            args.applied_date ?? null,
            args.resume_version ?? null,
            args.cover_letter_notes ?? null,
            args.referral_contact ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'schedule_interview',
      'Add an interview to an application',
      {
        application_id: z.string().describe('UUID of the application'),
        interview_type: z
          .enum(['phone_screen', 'technical', 'behavioral', 'system_design', 'hiring_manager', 'team', 'final'])
          .describe('Type of interview'),
        scheduled_at: z.string().optional().describe('When the interview is scheduled (ISO 8601)'),
        duration_minutes: z.number().optional().describe('Expected duration in minutes'),
        interviewer_name: z.string().optional().describe('Name of the interviewer'),
        interviewer_title: z.string().optional().describe('Title of the interviewer'),
        notes: z.string().optional().describe('Preparation notes or questions'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO interviews
             (application_id, interview_type, scheduled_at, duration_minutes,
              interviewer_name, interviewer_title, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            args.application_id,
            args.interview_type,
            args.scheduled_at ?? null,
            args.duration_minutes ?? null,
            args.interviewer_name ?? null,
            args.interviewer_title ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'job_search_dashboard',
      'Get an overview of your entire job search: pipeline stats, upcoming interviews, recent activity',
      {},
      withErrorHandler(async () => {
        const [pipeline, upcoming, recent] = await Promise.all([
          ctx.query(
            `SELECT status, count(*) AS count
               FROM applications
              GROUP BY status
              ORDER BY count DESC`,
          ),
          ctx.query(
            `SELECT i.*, a.status AS app_status,
                    jp.title AS job_title, c.name AS company_name
               FROM interviews i
               JOIN applications a ON a.id = i.application_id
               JOIN job_postings jp ON jp.id = a.job_posting_id
               JOIN companies c ON c.id = jp.company_id
              WHERE i.status = 'scheduled'
                AND i.scheduled_at >= now()
              ORDER BY i.scheduled_at ASC
              LIMIT 10`,
          ),
          ctx.query(
            `SELECT a.*, jp.title AS job_title, c.name AS company_name
               FROM applications a
               JOIN job_postings jp ON jp.id = a.job_posting_id
               JOIN companies c ON c.id = jp.company_id
              ORDER BY a.updated_at DESC
              LIMIT 10`,
          ),
        ]);

        return jsonResult({
          pipeline: pipeline.rows,
          upcoming_interviews: upcoming.rows,
          recent_applications: recent.rows,
        });
      }),
    );

    server.tool(
      'add_job_contact',
      'Add a contact related to your job search (recruiter, hiring manager, referral)',
      {
        name: z.string().describe('Contact name'),
        company_id: z.string().optional().describe('UUID of the company they belong to'),
        title: z.string().optional().describe('Job title'),
        email: z.string().optional().describe('Email'),
        phone: z.string().optional().describe('Phone'),
        linkedin_url: z.string().optional().describe('LinkedIn profile URL'),
        role_in_process: z
          .enum(['recruiter', 'hiring_manager', 'referral', 'interviewer', 'other'])
          .optional()
          .describe('Their role in your process'),
        notes: z.string().optional().describe('Notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO job_contacts
             (company_id, name, title, email, phone, linkedin_url, role_in_process, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            args.company_id ?? null,
            args.name,
            args.title ?? null,
            args.email ?? null,
            args.phone ?? null,
            args.linkedin_url ?? null,
            args.role_in_process ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );
  },
};
