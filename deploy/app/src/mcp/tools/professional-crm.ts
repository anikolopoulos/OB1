import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { registerTool, jsonResult, textResult, errorResult } from './tool-helpers.js';

export const professionalCrm: ExtensionDefinition = {
  name: 'professional-crm',
  requiredTables: ['professional_contacts', 'contact_interactions', 'opportunities'],
  register(server, ctx) {
    registerTool(
      server,
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
      async (args) => {
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
      },
    );

    registerTool(
      server,
      'update_contact',
      "Update an existing contact's details — only the fields you provide are changed",
      {
        contact_id: z.string().describe('UUID of the contact to update'),
        name: z.string().optional().describe('Updated full name'),
        company: z.string().optional().describe('Updated company name'),
        title: z.string().optional().describe('Updated job title'),
        email: z.string().optional().describe('Updated email address'),
        phone: z.string().optional().describe('Updated phone number'),
        linkedin_url: z.string().optional().describe('Updated LinkedIn profile URL'),
        how_we_met: z.string().optional().describe('Updated context for how you met'),
        tags: z.array(z.string()).optional().describe('Replace tags (e.g., ["ai", "consulting"])'),
        notes: z.string().optional().describe('Replace notes with new content'),
        follow_up_date: z
          .string()
          .nullable()
          .optional()
          .describe('Set follow-up date (YYYY-MM-DD), or null to clear'),
      },
      async (args) => {
        const setClauses: string[] = ['updated_at = now()'];
        const values: unknown[] = [];
        let idx = 1;

        if (args.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(args.name); }
        if (args.company !== undefined) { setClauses.push(`company = $${idx++}`); values.push(args.company); }
        if (args.title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(args.title); }
        if (args.email !== undefined) { setClauses.push(`email = $${idx++}`); values.push(args.email); }
        if (args.phone !== undefined) { setClauses.push(`phone = $${idx++}`); values.push(args.phone); }
        if (args.linkedin_url !== undefined) { setClauses.push(`linkedin_url = $${idx++}`); values.push(args.linkedin_url); }
        if (args.how_we_met !== undefined) { setClauses.push(`how_we_met = $${idx++}`); values.push(args.how_we_met); }
        if (args.tags !== undefined) { setClauses.push(`tags = $${idx++}`); values.push(args.tags); }
        if (args.notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(args.notes); }
        if (args.follow_up_date !== undefined) { setClauses.push(`follow_up_date = $${idx++}`); values.push(args.follow_up_date); }

        if (setClauses.length <= 1) {
          // Reachable only when the request contains just contact_id (typo'd
          // keys are rejected by the strict schema before the handler runs) —
          // still an error, not a success, for the calling model.
          return errorResult(
            'No updatable fields provided. Accepted fields: name, company, title, email, phone, linkedin_url, how_we_met, tags, notes, follow_up_date',
          );
        }

        values.push(args.contact_id);
        const { rows } = await ctx.query(
          `UPDATE professional_contacts SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
          values,
        );

        if (rows.length === 0) {
          return errorResult(`Contact not found: ${args.contact_id}`);
        }

        return jsonResult({ message: `Updated contact: ${rows[0].name}`, contact: rows[0] });
      },
    );

    registerTool(
      server,
      'search_contacts',
      'Search professional contacts. Uses PostgreSQL full-text search with ts_rank ordering; falls back to ILIKE if the FTS RPC is unavailable. Optional tag filter.',
      {
        query: z.string().optional().describe('Search term — boolean-ANDed across name, company, title, notes, how_we_met'),
        tags: z.array(z.string()).optional().describe('Filter by specific tags (array contains)'),
        limit: z.number().optional().default(20).describe('Max results'),
      },
      async ({ query, tags, limit }) => {
        if (query && query.trim()) {
          const tsQuery = query.trim().split(/\s+/).join(' & ');
          try {
            const { rows } = await ctx.query(
              `SELECT * FROM crm_search_contacts_fts($1, $2, $3)`,
              [tsQuery, tags ?? null, limit],
            );
            return jsonResult({ search_mode: 'fts', count: rows.length, contacts: rows });
          } catch {
            const { rows } = await ctx.query(
              `SELECT * FROM professional_contacts
                WHERE (name ILIKE '%' || $1 || '%'
                   OR company ILIKE '%' || $1 || '%'
                   OR title ILIKE '%' || $1 || '%'
                   OR notes ILIKE '%' || $1 || '%')
                  AND ($2::text[] IS NULL OR tags @> $2)
                ORDER BY last_contacted DESC NULLS LAST
                LIMIT $3`,
              [query, tags ?? null, limit],
            );
            return jsonResult({ search_mode: 'ilike_fallback', count: rows.length, contacts: rows });
          }
        }

        const { rows } = await ctx.query(
          `SELECT * FROM professional_contacts
            WHERE ($1::text[] IS NULL OR tags @> $1)
            ORDER BY name ASC
            LIMIT $2`,
          [tags ?? null, limit],
        );
        return jsonResult({ search_mode: 'list', count: rows.length, contacts: rows });
      },
    );

    registerTool(
      server,
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
      async (args) => {
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
      },
    );

    registerTool(
      server,
      'list_follow_ups',
      'List contacts with pending follow-ups or those not contacted recently',
      {
        days_stale: z
          .number()
          .optional()
          .default(30)
          .describe('Show contacts not contacted in this many days'),
      },
      async ({ days_stale }) => {
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
      },
    );

    registerTool(
      server,
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
      async (args) => {
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
      },
    );

    registerTool(
      server,
      'link_thought',
      'CROSS-EXTENSION: append a thought from core Open Brain into a contact\'s notes',
      {
        thought_id: z.string().describe('Thought UUID from the brain\'s thoughts table'),
        contact_id: z.string().describe('Contact UUID'),
      },
      async ({ thought_id, contact_id }) => {
        const { rows: thoughtRows } = await ctx.query(
          `SELECT content FROM thoughts WHERE id = $1`,
          [thought_id],
        );
        if (thoughtRows.length === 0) throw new Error('Thought not found');

        const { rows: contactRows } = await ctx.query(
          `SELECT notes FROM professional_contacts WHERE id = $1`,
          [contact_id],
        );
        if (contactRows.length === 0) throw new Error('Contact not found');

        const stamp = new Date().toISOString().split('T')[0];
        const linkNote = `\n\n[Linked Thought ${stamp}]: ${thoughtRows[0].content}`;
        const newNotes = (contactRows[0].notes ?? '') + linkNote;

        const { rows } = await ctx.query(
          `UPDATE professional_contacts SET notes = $1, updated_at = now() WHERE id = $2 RETURNING *`,
          [newNotes, contact_id],
        );
        return jsonResult({ message: `Linked thought to ${rows[0].name}`, contact: rows[0] });
      },
    );

    registerTool(
      server,
      'prep_context',
      'Meeting prep: full contact profile + recent interactions + open opportunities + pending follow-ups',
      {
        contact_id: z.string().describe('Contact UUID'),
        interaction_limit: z.number().optional().default(10).describe('Max interactions to include'),
      },
      async ({ contact_id, interaction_limit }) => {
        const [contactRes, interactionsRes, opportunitiesRes] = await Promise.all([
          ctx.query(`SELECT * FROM professional_contacts WHERE id = $1`, [contact_id]),
          ctx.query(
            `SELECT * FROM contact_interactions
              WHERE contact_id = $1
              ORDER BY occurred_at DESC
              LIMIT $2`,
            [contact_id, interaction_limit],
          ),
          ctx.query(
            `SELECT * FROM opportunities WHERE contact_id = $1 ORDER BY created_at DESC`,
            [contact_id],
          ),
        ]);

        if (contactRes.rows.length === 0) throw new Error('Contact not found');
        const contact = contactRes.rows[0];
        const interactions = interactionsRes.rows;
        const opportunities = opportunitiesRes.rows;

        const pendingFollowUps = interactions
          .filter((i) => i.follow_up_needed && i.follow_up_notes)
          .map((i) => ({ from_interaction: i.occurred_at, notes: i.follow_up_notes }));

        const daysSinceContact = contact.last_contacted
          ? Math.floor((Date.now() - new Date(contact.last_contacted).getTime()) / 86_400_000)
          : null;

        const activeOpportunities = opportunities.filter(
          (o) => !['won', 'lost'].includes(o.stage),
        );
        const totalPipelineValue = activeOpportunities.reduce(
          (sum, o) => sum + (parseFloat(o.value) || 0),
          0,
        );

        return jsonResult({
          briefing: {
            contact: {
              name: contact.name,
              company: contact.company,
              title: contact.title,
              email: contact.email,
              linkedin_url: contact.linkedin_url,
              how_we_met: contact.how_we_met,
              tags: contact.tags,
              notes: contact.notes,
            },
            relationship: {
              days_since_last_contact: daysSinceContact,
              last_contacted: contact.last_contacted,
              follow_up_date: contact.follow_up_date,
              total_interactions: interactions.length,
            },
            recent_interactions: interactions.map((i) => ({
              type: i.interaction_type,
              date: i.occurred_at,
              summary: i.summary,
            })),
            pending_follow_ups: pendingFollowUps,
            opportunities: {
              active_count: activeOpportunities.length,
              total_pipeline_value: totalPipelineValue,
              items: opportunities.map((o) => ({
                title: o.title,
                stage: o.stage,
                value: o.value,
                expected_close: o.expected_close_date,
              })),
            },
          },
        });
      },
    );

    registerTool(
      server,
      'stale_contacts',
      'Find contacts going cold — no interaction logged in the past N days, ordered by staleness',
      {
        days_threshold: z.number().optional().default(30).describe('Days without contact to consider stale'),
        limit: z.number().optional().default(20).describe('Max results'),
      },
      async ({ days_threshold, limit }) => {
        const { rows } = await ctx.query(
          `SELECT id, name, company, title, tags, last_contacted, follow_up_date
             FROM professional_contacts
            WHERE last_contacted IS NULL
               OR last_contacted < now() - ($1 * interval '1 day')
            ORDER BY last_contacted ASC NULLS FIRST
            LIMIT $2`,
          [days_threshold, limit],
        );

        const contacts = rows.map((c) => ({
          ...c,
          days_since_contact: c.last_contacted
            ? Math.floor((Date.now() - new Date(c.last_contacted).getTime()) / 86_400_000)
            : null,
        }));

        return jsonResult({
          threshold_days: days_threshold,
          count: contacts.length,
          stale_contacts: contacts,
        });
      },
    );
  },
};
