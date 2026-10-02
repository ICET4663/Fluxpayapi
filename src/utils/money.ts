import { randomBytes } from 'node:crypto';

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function generateReference(prefix = 'FLX'): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(5).toString('hex').toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}
