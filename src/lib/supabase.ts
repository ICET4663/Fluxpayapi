import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.ts';

const stateless = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

/** Privileged client (secret key). Server-side only: admin user management and token validation. */
export const adminClient: SupabaseClient = createClient(env.supabaseUrl, env.supabaseSecretKey, stateless);

/**
 * Publishable-key client for user-facing auth calls (sign up, sign in, OTP verification, recovery).
 * A fresh instance per call so one request's session can never leak into another's.
 */
export function authClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, stateless);
}
