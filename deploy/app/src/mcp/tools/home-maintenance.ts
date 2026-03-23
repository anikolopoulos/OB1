import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult } from './tool-helpers.js';

export const homeMaintenance: ExtensionDefinition = {
  name: 'home-maintenance',
  requiredTables: ['maintenance_tasks', 'maintenance_logs'],
  register(server, ctx) {
    server.tool(
      'add_maintenance_task',
      'Create a new maintenance task (recurring or one-time)',
      {
        name: z.string().describe('Name of the maintenance task'),
        category: z
          .string()
          .optional()
          .describe("Category (e.g. 'hvac', 'plumbing', 'exterior', 'appliance', 'landscaping')"),
        frequency_days: z
          .number()
          .optional()
          .describe(
            'How often this task repeats (in days). Null for one-time tasks. E.g. 90 for quarterly, 365 for annual'
          ),
        next_due: z
          .string()
          .optional()
          .describe("When is this task next due (ISO 8601 date string, e.g. '2026-04-15')"),
        priority: z
          .enum(['low', 'medium', 'high', 'urgent'])
          .optional()
          .describe('Priority level'),
        notes: z.string().optional().describe('Additional notes about this task'),
      },
      withErrorHandler(async ({ name, category, frequency_days, next_due, priority, notes }) => {
        const { rows } = await ctx.query(
          `INSERT INTO maintenance_tasks (name, category, frequency_days, next_due, priority, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            name,
            category ?? null,
            frequency_days ?? null,
            next_due ?? null,
            priority ?? 'medium',
            notes ?? null,
          ]
        );

        return jsonResult({
          success: true,
          message: `Added maintenance task: ${name}`,
          task: rows[0],
        });
      })
    );

    server.tool(
      'log_maintenance',
      "Log that a maintenance task was completed. Automatically updates task's last_completed and calculates next_due.",
      {
        task_id: z.string().describe('ID of the maintenance task (UUID)'),
        completed_at: z
          .string()
          .optional()
          .describe(
            'When the work was completed (ISO 8601 timestamp). Defaults to now if not provided.'
          ),
        performed_by: z
          .string()
          .optional()
          .describe("Who performed the work (e.g. 'self', vendor name)"),
        cost: z.number().optional().describe('Cost in dollars (or your currency)'),
        notes: z.string().optional().describe('Notes about the work performed'),
        next_action: z
          .string()
          .optional()
          .describe('Recommendations from the tech/contractor for next time'),
      },
      withErrorHandler(async ({ task_id, completed_at, performed_by, cost, notes, next_action }) => {
        // Insert the maintenance log
        // The database trigger will automatically update the parent task's last_completed and next_due
        const { rows: logRows } = await ctx.query(
          `INSERT INTO maintenance_logs (task_id, completed_at, performed_by, cost, notes, next_action)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            task_id,
            completed_at ?? new Date().toISOString(),
            performed_by ?? null,
            cost ?? null,
            notes ?? null,
            next_action ?? null,
          ]
        );

        // Fetch the updated task to show the new next_due
        const { rows: taskRows } = await ctx.query(
          'SELECT * FROM maintenance_tasks WHERE id = $1',
          [task_id]
        );

        return jsonResult({
          success: true,
          message: 'Maintenance logged successfully',
          log: logRows[0],
          updated_task: taskRows[0] ?? null,
        });
      })
    );

    server.tool(
      'get_upcoming_maintenance',
      'List maintenance tasks due in the next N days',
      {
        days_ahead: z.number().optional().describe('Number of days to look ahead (default 30)'),
      },
      withErrorHandler(async ({ days_ahead }) => {
        const daysAhead = days_ahead ?? 30;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

        const { rows } = await ctx.query(
          `SELECT * FROM maintenance_tasks
           WHERE next_due IS NOT NULL AND next_due <= $1
           ORDER BY next_due ASC`,
          [cutoffDate.toISOString()]
        );

        return jsonResult({
          success: true,
          days_ahead: daysAhead,
          count: rows.length,
          tasks: rows,
        });
      })
    );

    server.tool(
      'search_maintenance_history',
      'Search maintenance logs by task name, category, or date range',
      {
        task_name: z.string().optional().describe('Filter by task name (partial match)'),
        category: z.string().optional().describe('Filter by category'),
        date_from: z.string().optional().describe('Start date for filtering (ISO 8601 date string)'),
        date_to: z.string().optional().describe('End date for filtering (ISO 8601 date string)'),
      },
      withErrorHandler(async ({ task_name, category, date_from, date_to }) => {
        // If filtering by task name or category, first find matching task IDs
        let taskIds: string[] | null = null;

        if (task_name || category) {
          const taskConditions: string[] = [];
          const taskParams: unknown[] = [];
          let idx = 0;

          if (task_name) {
            idx++;
            taskConditions.push(`name ILIKE $${idx}`);
            taskParams.push(`%${task_name}%`);
          }

          if (category) {
            idx++;
            taskConditions.push(`category ILIKE $${idx}`);
            taskParams.push(`%${category}%`);
          }

          const { rows: tasks } = await ctx.query(
            `SELECT id FROM maintenance_tasks WHERE ${taskConditions.join(' AND ')}`,
            taskParams
          );

          taskIds = tasks.map((t: { id: string }) => t.id);

          if (taskIds.length === 0) {
            return jsonResult({ success: true, count: 0, logs: [] });
          }
        }

        // Now query maintenance_logs with a JOIN to get task info
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        if (taskIds) {
          idx++;
          conditions.push(`ml.task_id = ANY($${idx}::uuid[])`);
          params.push(taskIds);
        }

        if (date_from) {
          idx++;
          conditions.push(`ml.completed_at >= $${idx}`);
          params.push(date_from);
        }

        if (date_to) {
          idx++;
          conditions.push(`ml.completed_at <= $${idx}`);
          params.push(date_to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await ctx.query(
          `SELECT ml.*, mt.id AS task_id, mt.name AS task_name, mt.category AS task_category
           FROM maintenance_logs ml
           LEFT JOIN maintenance_tasks mt ON mt.id = ml.task_id
           ${whereClause}
           ORDER BY ml.completed_at DESC`,
          params
        );

        return jsonResult({
          success: true,
          count: rows.length,
          logs: rows,
        });
      })
    );
  },
};
