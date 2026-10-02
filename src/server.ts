import { app } from './app.ts';
import { env } from './config/env.ts';
import { pool } from './db/pool.ts';
import { reconcile } from './jobs/reconcile.ts';

const RECONCILE_INTERVAL_MS = 60_000;

const server = app.listen(env.port, () => {
  console.log(`FluxPay API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

async function runReconcile() {
  try {
    await reconcile();
  } catch (err) {
    console.error('reconcile job failed:', err instanceof Error ? err.message : err);
  }
}

const timer = setInterval(runReconcile, RECONCILE_INTERVAL_MS);
timer.unref();
void runReconcile();

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(timer);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
