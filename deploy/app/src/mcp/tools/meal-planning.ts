import { z } from 'zod';
import type { ExtensionDefinition } from '../tool-context.js';
import { withErrorHandler, jsonResult, errorResult } from './tool-helpers.js';

export const mealPlanning: ExtensionDefinition = {
  name: 'meal-planning',
  requiredTables: ['recipes', 'meal_plans', 'shopping_lists'],
  register(server, ctx) {
    server.tool(
      'add_recipe',
      'Add a recipe with ingredients and instructions',
      {
        name: z.string().describe('Recipe name'),
        cuisine: z.string().optional().describe('Cuisine type'),
        prep_time_minutes: z.number().optional().describe('Prep time in minutes'),
        cook_time_minutes: z.number().optional().describe('Cook time in minutes'),
        servings: z.number().optional().describe('Number of servings'),
        ingredients: z
          .array(
            z.object({
              name: z.string(),
              quantity: z.string(),
              unit: z.string(),
            })
          )
          .describe('Array of ingredient objects: [{name, quantity, unit}, ...]'),
        instructions: z.array(z.string()).describe('Array of instruction strings'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        rating: z.number().optional().describe('Rating 1-5'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `INSERT INTO recipes (name, cuisine, prep_time_minutes, cook_time_minutes, servings, ingredients, instructions, tags, rating, notes, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
           RETURNING *`,
          [
            args.name,
            args.cuisine ?? null,
            args.prep_time_minutes ?? null,
            args.cook_time_minutes ?? null,
            args.servings ?? null,
            JSON.stringify(args.ingredients),
            JSON.stringify(args.instructions),
            args.tags ?? [],
            args.rating ?? null,
            args.notes ?? null,
            new Date().toISOString(),
          ]
        );

        return jsonResult(rows[0]);
      })
    );

    server.tool(
      'search_recipes',
      'Search recipes by name, cuisine, tags, or ingredient',
      {
        query: z.string().optional().describe('Search query for name'),
        cuisine: z.string().optional().describe('Filter by cuisine'),
        tag: z.string().optional().describe('Filter by tag'),
        ingredient: z
          .string()
          .optional()
          .describe('Search for recipes containing this ingredient'),
      },
      withErrorHandler(async (args) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        if (args.query) {
          idx++;
          conditions.push(`name ILIKE $${idx}`);
          params.push(`%${args.query}%`);
        }

        if (args.cuisine) {
          idx++;
          conditions.push(`cuisine = $${idx}`);
          params.push(args.cuisine);
        }

        if (args.tag) {
          idx++;
          conditions.push(`$${idx} = ANY(tags)`);
          params.push(args.tag);
        }

        if (args.ingredient) {
          idx++;
          conditions.push(`ingredients @> $${idx}::jsonb`);
          params.push(JSON.stringify([{ name: args.ingredient }]));
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM recipes ${whereClause} ORDER BY created_at DESC`;

        const { rows } = await ctx.query(sql, params);

        return jsonResult(rows);
      })
    );

    server.tool(
      'update_recipe',
      'Update an existing recipe',
      {
        recipe_id: z.string().describe('Recipe ID (UUID)'),
        name: z.string().optional().describe('Recipe name'),
        cuisine: z.string().optional().describe('Cuisine type'),
        prep_time_minutes: z.number().optional().describe('Prep time in minutes'),
        cook_time_minutes: z.number().optional().describe('Cook time in minutes'),
        servings: z.number().optional().describe('Number of servings'),
        ingredients: z
          .array(
            z.object({
              name: z.string(),
              quantity: z.string(),
              unit: z.string(),
            })
          )
          .optional()
          .describe('Array of ingredient objects'),
        instructions: z.array(z.string()).optional().describe('Array of instruction strings'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        rating: z.number().optional().describe('Rating 1-5'),
        notes: z.string().optional().describe('Additional notes'),
      },
      withErrorHandler(async (args) => {
        const setClauses: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [];
        let idx = 0;

        if (args.name !== undefined) {
          idx++;
          setClauses.push(`name = $${idx}`);
          params.push(args.name);
        }
        if (args.cuisine !== undefined) {
          idx++;
          setClauses.push(`cuisine = $${idx}`);
          params.push(args.cuisine);
        }
        if (args.prep_time_minutes !== undefined) {
          idx++;
          setClauses.push(`prep_time_minutes = $${idx}`);
          params.push(args.prep_time_minutes);
        }
        if (args.cook_time_minutes !== undefined) {
          idx++;
          setClauses.push(`cook_time_minutes = $${idx}`);
          params.push(args.cook_time_minutes);
        }
        if (args.servings !== undefined) {
          idx++;
          setClauses.push(`servings = $${idx}`);
          params.push(args.servings);
        }
        if (args.ingredients !== undefined) {
          idx++;
          setClauses.push(`ingredients = $${idx}::jsonb`);
          params.push(JSON.stringify(args.ingredients));
        }
        if (args.instructions !== undefined) {
          idx++;
          setClauses.push(`instructions = $${idx}::jsonb`);
          params.push(JSON.stringify(args.instructions));
        }
        if (args.tags !== undefined) {
          idx++;
          setClauses.push(`tags = $${idx}`);
          params.push(args.tags);
        }
        if (args.rating !== undefined) {
          idx++;
          setClauses.push(`rating = $${idx}`);
          params.push(args.rating);
        }
        if (args.notes !== undefined) {
          idx++;
          setClauses.push(`notes = $${idx}`);
          params.push(args.notes);
        }

        idx++;
        params.push(args.recipe_id);

        const { rows } = await ctx.query(
          `UPDATE recipes SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
          params
        );

        if (!rows.length) {
          throw new Error('Recipe not found');
        }

        return jsonResult(rows[0]);
      })
    );

    server.tool(
      'create_meal_plan',
      'Plan meals for a week',
      {
        week_start: z.string().describe('Monday of the week (YYYY-MM-DD)'),
        meals: z
          .array(
            z.object({
              day_of_week: z.string(),
              meal_type: z.string(),
              recipe_id: z.string().optional(),
              custom_meal: z.string().optional(),
              servings: z.number().optional(),
              notes: z.string().optional(),
            })
          )
          .describe(
            'Array of meal entries: [{day_of_week, meal_type, recipe_id?, custom_meal?, servings?, notes?}, ...]'
          ),
      },
      withErrorHandler(async (args) => {
        if (args.meals.length === 0) {
          return errorResult('meals array is empty');
        }

        // Build a multi-row INSERT
        const valueParts: string[] = [];
        const params: unknown[] = [];
        let idx = 0;

        for (const meal of args.meals) {
          const indices: string[] = [];
          idx++;
          indices.push(`$${idx}`);
          params.push(args.week_start);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.day_of_week);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.meal_type);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.recipe_id ?? null);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.custom_meal ?? null);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.servings ?? null);
          idx++;
          indices.push(`$${idx}`);
          params.push(meal.notes ?? null);

          valueParts.push(`(${indices.join(', ')})`);
        }

        const { rows } = await ctx.query(
          `INSERT INTO meal_plans (week_start, day_of_week, meal_type, recipe_id, custom_meal, servings, notes)
           VALUES ${valueParts.join(', ')}
           RETURNING *`,
          params
        );

        return jsonResult(rows);
      })
    );

    server.tool(
      'get_meal_plan',
      'View the meal plan for a given week',
      {
        week_start: z.string().describe('Monday of the week (YYYY-MM-DD)'),
      },
      withErrorHandler(async (args) => {
        const { rows } = await ctx.query(
          `SELECT mp.*, r.name AS recipe_name, r.cuisine, r.prep_time_minutes, r.cook_time_minutes
           FROM meal_plans mp
           LEFT JOIN recipes r ON r.id = mp.recipe_id
           WHERE mp.week_start = $1
           ORDER BY mp.day_of_week, mp.meal_type`,
          [args.week_start]
        );

        return jsonResult(rows);
      })
    );

    server.tool(
      'generate_shopping_list',
      "Auto-generate a shopping list from a week's meal plan by aggregating recipe ingredients",
      {
        week_start: z.string().describe('Monday of the week (YYYY-MM-DD)'),
      },
      withErrorHandler(async (args) => {
        // Get the meal plan with recipe ingredients for the week
        const { rows: mealPlan } = await ctx.query(
          `SELECT mp.*, r.id AS r_id, r.ingredients AS r_ingredients, r.name AS r_name
           FROM meal_plans mp
           LEFT JOIN recipes r ON r.id = mp.recipe_id
           WHERE mp.week_start = $1`,
          [args.week_start]
        );

        // Aggregate ingredients from all recipes
        const itemsMap = new Map<
          string,
          { name: string; quantity: string; unit: string; purchased: boolean; recipe_id: string }
        >();

        for (const meal of mealPlan) {
          if (meal.r_ingredients) {
            const ingredients = (
              typeof meal.r_ingredients === 'string'
                ? JSON.parse(meal.r_ingredients)
                : meal.r_ingredients
            ) as Array<{ name: string; quantity: string; unit: string }>;

            for (const ingredient of ingredients) {
              const key = `${ingredient.name}-${ingredient.unit}`;
              if (itemsMap.has(key)) {
                const existing = itemsMap.get(key)!;
                existing.quantity = `${existing.quantity} + ${ingredient.quantity}`;
              } else {
                itemsMap.set(key, {
                  name: ingredient.name,
                  quantity: ingredient.quantity,
                  unit: ingredient.unit,
                  purchased: false,
                  recipe_id: meal.r_id,
                });
              }
            }
          }
        }

        const items = Array.from(itemsMap.values());

        // Check if shopping list already exists
        const { rows: existing } = await ctx.query(
          'SELECT id FROM shopping_lists WHERE week_start = $1',
          [args.week_start]
        );

        let result;
        if (existing.length > 0) {
          const { rows } = await ctx.query(
            `UPDATE shopping_lists SET items = $1::jsonb, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [JSON.stringify(items), existing[0].id]
          );
          result = rows[0];
        } else {
          const { rows } = await ctx.query(
            `INSERT INTO shopping_lists (week_start, items)
             VALUES ($1, $2::jsonb)
             RETURNING *`,
            [args.week_start, JSON.stringify(items)]
          );
          result = rows[0];
        }

        return jsonResult(result);
      })
    );
  },
};
