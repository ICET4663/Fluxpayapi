import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.ts';
import { mapUser, type User, type UserRow } from './users.types.ts';

export function createUser(input: {
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
}): User {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.fullName, input.email.toLowerCase(), input.phone, input.passwordHash);
  return findUserByIdOrThrow(id);
}

export function findUserByEmail(email: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserByPhone(phone: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserById(id: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserByIdOrThrow(id: string): User {
  const user = findUserById(id);
  if (!user) throw new Error(`User ${id} not found`);
  return user;
}

export function markPhoneVerified(userId: string) {
  db.prepare(`UPDATE users SET phone_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(userId);
}

export function markEmailVerified(userId: string) {
  db.prepare(`UPDATE users SET email_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(userId);
}

export function setPinHash(userId: string, pinHash: string) {
  db.prepare(`UPDATE users SET pin_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(pinHash, userId);
}

export function setPasswordHash(userId: string, passwordHash: string) {
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(passwordHash, userId);
}

export function updateProfile(userId: string, input: { fullName?: string }) {
  if (input.fullName) {
    db.prepare(`UPDATE users SET full_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(input.fullName, userId);
  }
  return findUserByIdOrThrow(userId);
}

export function setBiometricEnabled(userId: string, enabled: boolean) {
  db.prepare(`UPDATE users SET biometric_enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(enabled ? 1 : 0, userId);
}
