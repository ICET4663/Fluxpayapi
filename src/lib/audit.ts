import { query } from '../db/pool.ts';

/** Best-effort: an audit write failing must never fail (or slow down) the request that triggered it. */
export function recordAudit(action: string, userId: string | null, ip: string | undefined, metadata?: Record<string, unknown>) {
  query(`insert into audit_logs (user_id, action, ip, metadata) values ($1, $2, $3, $4)`, [
    userId,
    action,
    ip ?? null,
    metadata ? JSON.stringify(metadata) : null,
  ]).catch((err) => console.error('audit log write failed:', err.message));
}
