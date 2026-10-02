import pg from 'pg';
import { env } from '../config/env.ts';

// bigint (int8) columns hold kobo amounts. They stay far below Number.MAX_SAFE_INTEGER, so plain numbers are safe.
pg.types.setTypeParser(20, (v) => Number(v));
// Return timestamptz as ISO strings so rows serialise straight to JSON.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase's pooler certificate chain is not in Node's trust store.
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected idle database client error', err);
});

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
