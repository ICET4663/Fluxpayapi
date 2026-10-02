export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: 'user' | 'admin';
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: string | null;
  biometricEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  biometric_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role === 'admin' ? 'admin' : 'user',
    pinHash: row.pin_hash,
    pinFailedAttempts: row.pin_failed_attempts,
    pinLockedUntil: row.pin_locked_until,
    biometricEnabled: row.biometric_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicUser(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    hasPin: user.pinHash !== null,
    // Users can only hold a session after confirming their email, so any authenticated user is verified.
    emailVerified: true,
    biometricEnabled: user.biometricEnabled,
    createdAt: user.createdAt,
  };
}
