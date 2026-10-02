import { queryOne } from '../../db/pool.ts';
import { hashSecret, verifySecret } from '../../lib/password.ts';
import { recordAudit } from '../../lib/audit.ts';
import { AppError } from '../../utils/AppError.ts';
import type { User } from './users.types.ts';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function hashPin(pin: string) {
  return hashSecret(pin);
}

/**
 * Checks a transaction PIN with brute-force protection: 5 wrong guesses lock PIN use for 15 minutes.
 * A 4-digit PIN has only 10,000 combinations, so without this limit anyone holding a session could guess it.
 */
export async function assertPinCorrect(user: User, pin: string, ip?: string): Promise<void> {
  // Re-read from the database: the copy on req.user may predate a concurrent failed attempt.
  const state = await queryOne<{ pin_hash: string | null; pin_locked_until: string | null; pin_failed_attempts: number }>(
    `select pin_hash, pin_locked_until, pin_failed_attempts from profiles where id = $1`,
    [user.id],
  );
  if (!state?.pin_hash) throw AppError.forbidden('Set a transaction PIN before making payments');

  if (state.pin_locked_until && new Date(state.pin_locked_until).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(state.pin_locked_until).getTime() - Date.now()) / 60_000);
    throw new AppError(423, 'pin_locked', `Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  if (await verifySecret(pin, state.pin_hash)) {
    if (state.pin_failed_attempts > 0 || state.pin_locked_until) {
      await queryOne(`update profiles set pin_failed_attempts = 0, pin_locked_until = null where id = $1`, [user.id]);
    }
    return;
  }

  // Atomic increment so concurrent guesses cannot slip past the counter.
  const updated = await queryOne<{ pin_failed_attempts: number }>(
    `update profiles
        set pin_failed_attempts = case when pin_failed_attempts + 1 >= $2 then 0 else pin_failed_attempts + 1 end,
            pin_locked_until    = case when pin_failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else null end
      where id = $1
      returning pin_failed_attempts`,
    [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
  );

  const justLocked = updated?.pin_failed_attempts === 0;
  recordAudit(justLocked ? 'pin_locked' : 'pin_failed', user.id, ip);
  if (justLocked) {
    throw new AppError(423, 'pin_locked', `Too many incorrect PIN attempts. PIN locked for ${LOCK_MINUTES} minutes.`);
  }
  const remaining = MAX_FAILED_ATTEMPTS - (updated?.pin_failed_attempts ?? 0);
  throw new AppError(401, 'incorrect_pin', `Incorrect transaction PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`);
}
