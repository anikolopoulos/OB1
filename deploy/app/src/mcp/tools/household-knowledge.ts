import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult } from './tool-helpers.js';

export const householdKnowledge: ExtensionDefinition = {
  name: 'household-knowledge',
  requiredTables: ['household_items', 'household_vendors'],
  register(server, ctx) {
    server.tool(
      'add_household_item',
      'Add a new household item (paint color, appliance, measurement, document, etc.)',
      {
        name: z.string().describe('Name or description of the item'),
        category: z
          .string()
          .optional()
          .describe("Category (e.g. 'paint', 'appliance', 'measurement', 'document')"),
        location: z
          .string()
          .optional()
          .describe("Location in the home (e.g. 'Living Room', 'Kitchen')"),
        details: z
          .string()
          .optional()
          .describe(
            'Flexible metadata as JSON string (e.g. \'{"brand": "Sherwin Williams", "color": "Sea Salt"}\')'
          ),
        notes: z.string().optional().describe('Additional notes or context'),
      },
      withErrorHandler(async ({ name, category, location, details, notes }) => {
        const { rows } = await ctx.query(
          `INSERT INTO household_items (name, category, location, details, notes)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           RETURNING *`,
          [name, category ?? null, location ?? null, details ?? '{}', notes ?? null]
        );

        return jsonResult({
          success: true,
          message: `Added household item: ${name}`,
          item: rows[0],
        });
      })
    );

    server.tool(
      'search_household_items',
      'Search household items by name, category, or location',
      {
        query: z
          .string()
          .optional()
          .describe('Search term (searches name, category, location, and notes)'),
        category: z.string().optional().describe('Filter by specific category'),
        location: z.string().optional().describe('Filter by specific location'),
      },
      withErrorHandler(async ({ query, category, location }) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        if (category) {
          idx++;
          conditions.push(`category ILIKE $${idx}`);
          params.push(`%${category}%`);
        }

        if (location) {
          idx++;
          conditions.push(`location ILIKE $${idx}`);
          params.push(`%${location}%`);
        }

        if (query) {
          idx++;
          const p = `$${idx}`;
          conditions.push(
            `(name ILIKE ${p} OR category ILIKE ${p} OR location ILIKE ${p} OR notes ILIKE ${p})`
          );
          params.push(`%${query}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM household_items ${whereClause} ORDER BY created_at DESC`;

        const { rows } = await ctx.query(sql, params);

        return jsonResult({
          success: true,
          count: rows.length,
          items: rows,
        });
      })
    );

    server.tool(
      'get_item_details',
      'Get full details of a specific household item by ID',
      {
        item_id: z.string().describe('Item ID (UUID)'),
      },
      withErrorHandler(async ({ item_id }) => {
        const { rows } = await ctx.query(
          'SELECT * FROM household_items WHERE id = $1',
          [item_id]
        );

        if (!rows.length) {
          throw new Error('Item not found or access denied');
        }

        return jsonResult({
          success: true,
          item: rows[0],
        });
      })
    );

    server.tool(
      'add_vendor',
      'Add a service provider (plumber, electrician, landscaper, etc.)',
      {
        name: z.string().describe('Vendor name'),
        service_type: z
          .string()
          .optional()
          .describe("Type of service (e.g. 'plumber', 'electrician', 'landscaper')"),
        phone: z.string().optional().describe('Phone number'),
        email: z.string().optional().describe('Email address'),
        website: z.string().optional().describe('Website URL'),
        notes: z.string().optional().describe('Additional notes'),
        rating: z.number().min(1).max(5).optional().describe('Rating from 1-5'),
        last_used: z.string().optional().describe('Date last used (YYYY-MM-DD format)'),
      },
      withErrorHandler(async ({ name, service_type, phone, email, website, notes, rating, last_used }) => {
        const { rows } = await ctx.query(
          `INSERT INTO household_vendors (name, service_type, phone, email, website, notes, rating, last_used)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            name,
            service_type ?? null,
            phone ?? null,
            email ?? null,
            website ?? null,
            notes ?? null,
            rating ?? null,
            last_used ?? null,
          ]
        );

        return jsonResult({
          success: true,
          message: `Added vendor: ${name}`,
          vendor: rows[0],
        });
      })
    );

    server.tool(
      'list_vendors',
      'List service providers, optionally filtered by service type',
      {
        service_type: z
          .string()
          .optional()
          .describe("Filter by service type (e.g. 'plumber', 'electrician')"),
      },
      withErrorHandler(async ({ service_type }) => {
        let sql = 'SELECT * FROM household_vendors';
        const params: unknown[] = [];

        if (service_type) {
          sql += ' WHERE service_type ILIKE $1';
          params.push(`%${service_type}%`);
        }

        sql += ' ORDER BY name ASC';

        const { rows } = await ctx.query(sql, params);

        return jsonResult({
          success: true,
          count: rows.length,
          vendors: rows,
        });
      })
    );
  },
};
