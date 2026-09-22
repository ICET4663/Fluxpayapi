import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.ts';

export type OtpPurpose = 'verify_phone' | 'verify_email' | 'reset_password';

interface OtpRow {
  id: string;
  user_id: string;
  purpose: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
}

export function createOtp(userId: string, purpose: OtpPurpose, codeHash: string, ttlMinutes: number) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  db.prepare(
    `INSERT INTO otps (id, user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, purpose, codeHash, expiresAt);
  return { id, expiresAt };
}

export function getLatestActiveOtp(userId: string, purpose: OtpPurpose): OtpRow | null {
  const row = db
    .prepare(
      `SELECT * FROM otps WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, purpose) as OtpRow | undefined;
  return row ?? null;
}

export function incrementOtpAttempts(id: string) {
  db.prepare(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`).run(id);
}

export function consumeOtp(id: string) {
  db.prepare(`UPDATE otps SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);
}
