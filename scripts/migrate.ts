// Applies every SQL file in db/migrations that has not been applied yet, in filename order.
// Usage: npm run db:migrate
//
// Needs only DATABASE_URL, so it can run before the rest of the environment is configured.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);

  const done = new Set((await client.query<{ name: string }>('select name from public.schema_migrations')).rows.map((r) => r.name));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    console.log(`Applying ${file} ...`);
    await client.query('begin');
    try {
      await client.query(readFileSync(path.join(dir, file), 'utf-8'));
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied++;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }

  console.log(applied === 0 ? 'Database is up to date.' : `Applied ${applied} migration(s).`);
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
