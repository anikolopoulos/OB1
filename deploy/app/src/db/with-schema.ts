import type pg from 'pg';
import format from 'pg-format';
import { pool } from './pool.js';

export type QueryFn = (
  text: string,
  params?: unknown[],
) => Promise<pg.QueryResult>;

export async function withBrainSchema<T>(
  schemaName: string,
  fn: (query: QueryFn) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    const safePath = format('SET search_path TO %I, public', schemaName);
    await client.query(safePath);

    const query: QueryFn = (text, params) => client.query(text, params);

    return await fn(query);
  } finally {
    try {
      await client.query('RESET search_path');
      client.release();
    } catch {
      // If reset fails, destroy the connection rather than returning a
      // tainted client to the pool (cross-brain data leakage prevention).
      client.release(true);
    }
  }
}
