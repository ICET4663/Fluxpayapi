import { randomUUID } from 'node:crypto';
import { db } from '../db/client.ts';

export function recordAudit(action: string, userId: string | null, ip: string | undefined, metadata?: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, action, ip, metadata) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, action, ip ?? null, metadata ? JSON.stringify(metadata) : null);
}
