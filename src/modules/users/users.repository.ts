import { query, queryOne } from '../../db/pool.ts';
import { mapUser, type User, type UserRow } from './users.types.ts';

export async function findUserById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>(`select * from profiles where id = $1`, [id]);
  return row ? mapUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await queryOne<UserRow>(`select * from profiles where lower(email) = lower($1)`, [email]);
  return row ? mapUser(row) : null;
}

export async function isPhoneTaken(phone: string): Promise<boolean> {
  const row = await queryOne(`select 1 from profiles where phone = $1`, [phone]);
  return row !== null;
}

/** Looks in auth.users (not profiles): an account that has not confirmed its email yet must still be found. */
export async function findAuthAccountByEmail(email: string): Promise<{ id: string; confirmed: boolean } | null> {
  const row = await queryOne<{ id: string; email_confirmed_at: string | null }>(
    `select id, email_confirmed_at from auth.users where lower(email) = lower($1) limit 1`,
    [email],
  );
  return row ? { id: row.id, confirmed: row.email_confirmed_at !== null } : null;
}

export async function setPinHash(userId: string, pinHash: string) {
  await query(
    `update profiles set pin_hash = $1, pin_failed_attempts = 0, pin_locked_until = null where id = $2`,
    [pinHash, userId],
  );
}

export async function updateProfile(userId: string, input: { fullName?: string }): Promise<User> {
  const row = await queryOne<UserRow>(
    `update profiles set full_name = coalesce($1, full_name) where id = $2 returning *`,
    [input.fullName ?? null, userId],
  );
  if (!row) throw new Error(`User ${userId} not found`);
  return mapUser(row);
}

export async function setBiometricEnabled(userId: string, enabled: boolean) {
  await query(`update profiles set biometric_enabled = $1 where id = $2`, [enabled, userId]);
}
