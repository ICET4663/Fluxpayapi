export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  pinHash: string | null;
  role: 'user' | 'admin';
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  biometricEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  pin_hash: string | null;
  role: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  biometric_enabled: number;
  created_at: string;
  updated_at: string;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    pinHash: row.pin_hash,
    role: row.role === 'admin' ? 'admin' : 'user',
    emailVerifiedAt: row.email_verified_at,
    phoneVerifiedAt: row.phone_verified_at,
    biometricEnabled: Boolean(row.biometric_enabled),
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
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    biometricEnabled: user.biometricEnabled,
    createdAt: user.createdAt,
  };
}
