import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult, textResult } from './tool-helpers.js';

export const professionalCrm: ExtensionDefinition = {
  name: 'professional-crm',
  requiredTables: ['professional_contacts', 'contact_interactions', 'opportunities'],
  register(server, ctx) {
    server.tool(
      'add_contact',
      'Add a professional contact to your CRM',
      {
        name: z.string().describe('Full name of the contact'),
        company: z.string().optional().describe('Company they work for'),
        title: z.string().optional().describe('Job title'),
        email: z.string().optional().describe('Email address'),
        phone: z.string().optional().describe('Phone number'),
        linkedin_url: z.string().optional().describe('LinkedIn profile URL'),
        how_we_met: z.string().optional().describe('How you met this person'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO professional_contacts
             (name, company, title, email, phone, linkedin_url, how_we_met, tags, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            args.name,
            args.company ?? null,
            args.title ?? null,
            args.email ?? null,
            args.phone ?? null,
            args.linkedin_url ?? null,
            args.how_we_met ?? null,
            args.tags ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'search_contacts',
      'Search professional contacts by name, company, or tags',
      {
        query: z.string().describe('Search term (matches name, company, title, or notes)'),
        limit: z.number().optional().default(20).describe('Max results'),
      },
      withErrorHandler(async ({ query, limit }) => {
        const { rows } = await ctx.query(
          `SELECT * FROM professional_contacts
            WHERE name ILIKE '%' || $1 || '%'
               OR company ILIKE '%' || $1 || '%'
               OR title ILIKE '%' || $1 || '%'
               OR notes ILIKE '%' || $1 || '%'
            ORDER BY last_contacted DESC NULLS LAST
            LIMIT $2`,
          [query, limit],
        );
        return jsonResult(rows);
      }),
    );

    server.tool(
      'log_interaction',
      'Log an interaction with a professional contact',
      {
        contact_id: z.string().describe('UUID of the contact'),
        interaction_type: z
          .enum(['meeting', 'email', 'call', 'coffee', 'event', 'linkedin', 'other'])
          .describe('Type of interaction'),
        summary: z.string().optional().describe('Summary of the interaction'),
        follow_up_needed: z.boolean().optional().default(false).describe('Whether follow-up is needed'),
        follow_up_notes: z.string().optional().describe('Notes about follow-up'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO contact_interactions
             (contact_id, interaction_type, summary, follow_up_needed, follow_up_notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            args.contact_id,
            args.interaction_type,
            args.summary ?? null,
            args.follow_up_needed,
            args.follow_up_notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );

    server.tool(
      'list_follow_ups',
      'List contacts with pending follow-ups or those not contacted recently',
      {
        days_stale: z
          .number()
          .optional()
          .default(30)
          .describe('Show contacts not contacted in this many days'),
      },
      withErrorHandler(async ({ days_stale }) => {
        const { rows } = await ctx.query(
          `SELECT * FROM professional_contacts
            WHERE follow_up_date IS NOT NULL
               OR last_contacted < now() - ($1 * interval '1 day')
               OR last_contacted IS NULL
            ORDER BY follow_up_date ASC NULLS LAST, last_contacted ASC NULLS FIRST
            LIMIT 50`,
          [days_stale],
        );
        return jsonResult(rows);
      }),
    );

    server.tool(
      'manage_opportunity',
      'Create or update a business/career opportunity linked to a contact',
      {
        id: z.string().optional().describe('UUID of existing opportunity to update (omit to create new)'),
        contact_id: z.string().optional().describe('UUID of the associated contact'),
        title: z.string().describe('Title of the opportunity'),
        description: z.string().optional().describe('Description'),
        stage: z
          .enum(['identified', 'in_conversation', 'proposal', 'negotiation', 'won', 'lost'])
          .optional()
          .describe('Current stage'),
        value: z.number().optional().describe('Monetary value'),
        expected_close_date: z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        if (args.id) {
          const setClauses: string[] = ['updated_at = now()'];
          const values: unknown[] = [];
          let idx = 1;

          if (args.title) { setClauses.push(`title = $${idx++}`); values.push(args.title); }
          if (args.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(args.description); }
          if (args.stage) { setClauses.push(`stage = $${idx++}`); values.push(args.stage); }
          if (args.value !== undefined) { setClauses.push(`value = $${idx++}`); values.push(args.value); }
          if (args.expected_close_date) { setClauses.push(`expected_close_date = $${idx++}`); values.push(args.expected_close_date); }
          if (args.notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(args.notes); }

          if (setClauses.length <= 1) {
            return textResult('No fields to update');
          }

          values.push(args.id);
          const { rows } = await ctx.query(
            `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
            values,
          );
          return jsonResult(rows[0]);
        }

        const { rows } = await ctx.query(
          `INSERT INTO opportunities
             (contact_id, title, description, stage, value, expected_close_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            args.contact_id ?? null,
            args.title,
            args.description ?? null,
            args.stage ?? 'identified',
            args.value ?? null,
            args.expected_close_date ?? null,
            args.notes ?? null,
          ],
        );
        return jsonResult(rows[0]);
      }),
    );
  },
};
