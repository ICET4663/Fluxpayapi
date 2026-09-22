import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.ts';
import { env } from '../../config/env.ts';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

export function storeRefreshToken(userId: string, tokenHash: string): { id: string; expiresAt: string } {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000).toISOString();
  db.prepare(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
    id,
    userId,
    tokenHash,
    expiresAt,
  );
  return { id, expiresAt };
}

export function findRefreshTokenByHash(tokenHash: string): RefreshTokenRow | null {
  const row = db.prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`).get(tokenHash) as
    | RefreshTokenRow
    | undefined;
  return row ?? null;
}

export function revokeRefreshToken(id: string, replacedBy?: string) {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), replaced_by = ? WHERE id = ?`,
  ).run(replacedBy ?? null, id);
}

export function revokeAllRefreshTokensForUser(userId: string) {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL`,
  ).run(userId);
}
