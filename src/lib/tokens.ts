import { randomBytes, createHash } from 'node:crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
