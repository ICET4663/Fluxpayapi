export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

export function generateReference(prefix = 'FLX'): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
