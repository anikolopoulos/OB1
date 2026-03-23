import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult } from './tool-helpers.js';

export const familyCalendar: ExtensionDefinition = {
  name: 'family-calendar',
  requiredTables: ['family_members', 'activities', 'important_dates'],
  register(server, ctx) {
    server.tool(
      'add_family_member',
      'Add a person to your household roster',
      {
        name: z.string().describe("Person's name"),
        relationship: z
          .string()
          .optional()
          .describe("Relationship to you (e.g. 'self', 'spouse', 'child', 'parent')"),
        birth_date: z.string().optional().describe('Birth date (YYYY-MM-DD format)'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO family_members (name, relationship, birth_date, notes)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [args.name, args.relationship ?? null, args.birth_date ?? null, args.notes ?? null]
        );

        return jsonResult(rows[0]);
      })
    );

    server.tool(
      'add_activity',
      'Schedule an activity or recurring event',
      {
        family_member_id: z
          .string()
          .optional()
          .describe('Family member ID (null for whole family)'),
        title: z.string().describe('Activity title'),
        activity_type: z
          .string()
          .optional()
          .describe("Type: 'sports', 'medical', 'school', 'social', etc."),
        day_of_week: z
          .string()
          .optional()
          .describe("For recurring events: 'monday', 'tuesday', etc. Leave null for one-time"),
        start_time: z.string().optional().describe('Start time (HH:MM format)'),
        end_time: z.string().optional().describe('End time (HH:MM format)'),
        start_date: z.string().optional().describe('Start date (YYYY-MM-DD format)'),
        end_date: z
          .string()
          .optional()
          .describe('End date for recurring (YYYY-MM-DD), null for ongoing'),
        location: z.string().optional().describe('Location'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO activities (family_member_id, title, activity_type, day_of_week, start_time, end_time, start_date, end_date, location, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            args.family_member_id ?? null,
            args.title,
            args.activity_type ?? null,
            args.day_of_week ?? null,
            args.start_time ?? null,
            args.end_time ?? null,
            args.start_date ?? null,
            args.end_date ?? null,
            args.location ?? null,
            args.notes ?? null,
          ]
        );

        return jsonResult(rows[0]);
      })
    );

    server.tool(
      'get_week_schedule',
      'Get all activities for a given week, grouped by day',
      {
        week_start: z.string().describe('Monday of the week (YYYY-MM-DD format)'),
        family_member_id: z
          .string()
          .optional()
          .describe('Optional: filter by family member'),
      },
      withErrorHandler(async (args) => {
        const weekStart = new Date(args.week_start);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        // Activities that overlap this week: either recurring (day_of_week not null)
        // or one-time with start_date in range
        idx++;
        params.push(weekEndStr);
        idx++;
        params.push(args.week_start);
        conditions.push(
          `((start_date <= $1 AND (end_date >= $2 OR end_date IS NULL)) OR day_of_week IS NOT NULL)`
        );

        if (args.family_member_id) {
          idx++;
          conditions.push(`family_member_id = $${idx}`);
          params.push(args.family_member_id);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await ctx.query(
          `SELECT a.*, fm.name AS member_name, fm.relationship AS member_relationship
           FROM activities a
           LEFT JOIN family_members fm ON fm.id = a.family_member_id
           ${whereClause}
           ORDER BY a.start_time`,
          params
        );

        return jsonResult(rows);
      })
    );

    server.tool(
      'search_activities',
      'Search activities by title, type, or family member name',
      {
        query: z.string().optional().describe('Search query'),
        activity_type: z.string().optional().describe('Optional: filter by activity type'),
        family_member_id: z
          .string()
          .optional()
          .describe('Optional: filter by family member'),
      },
      withErrorHandler(async (args) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        if (args.query) {
          idx++;
          conditions.push(`a.title ILIKE $${idx}`);
          params.push(`%${args.query}%`);
        }

        if (args.activity_type) {
          idx++;
          conditions.push(`a.activity_type = $${idx}`);
          params.push(args.activity_type);
        }

        if (args.family_member_id) {
          idx++;
          conditions.push(`a.family_member_id = $${idx}`);
          params.push(args.family_member_id);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await ctx.query(
          `SELECT a.*, fm.name AS member_name, fm.relationship AS member_relationship
           FROM activities a
           LEFT JOIN family_members fm ON fm.id = a.family_member_id
           ${whereClause}
           ORDER BY a.start_date DESC`,
          params
        );

        return jsonResult(rows);
      })
    );

    server.tool(
      'add_important_date',
      'Add a date to remember (birthday, anniversary, deadline)',
      {
        family_member_id: z
          .string()
          .optional()
          .describe('Family member ID (null for family-wide)'),
        title: z.string().describe('Event title'),
        date_value: z.string().describe('Date (YYYY-MM-DD format)'),
        recurring_yearly: z.boolean().optional().describe('Does this repeat every year?'),
        reminder_days_before: z
          .number()
          .optional()
          .describe('Days before to remind (default 7)'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO important_dates (family_member_id, title, date_value, recurring_yearly, reminder_days_before, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            args.family_member_id ?? null,
            args.title,
            args.date_value,
            args.recurring_yearly ?? false,
            args.reminder_days_before ?? 7,
            args.notes ?? null,
          ]
        );

        return jsonResult(rows[0]);
      })
    );

    server.tool(
      'get_upcoming_dates',
      'Get important dates in the next N days',
      {
        days_ahead: z.number().optional().describe('How many days to look ahead (default 30)'),
      },
      withErrorHandler(async (args) => {
        const daysAhead = args.days_ahead ?? 30;
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + daysAhead);

        const todayStr = today.toISOString().split('T')[0];
        const futureStr = futureDate.toISOString().split('T')[0];

        const { rows } = await ctx.query(
          `SELECT id.*, fm.name AS member_name, fm.relationship AS member_relationship
           FROM important_dates id
           LEFT JOIN family_members fm ON fm.id = id.family_member_id
           WHERE id.date_value >= $1 AND id.date_value <= $2
           ORDER BY id.date_value`,
          [todayStr, futureStr]
        );

        return jsonResult(rows);
      })
    );
  },
};
