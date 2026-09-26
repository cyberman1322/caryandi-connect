import { getSupabase, setRememberSession } from '@/lib/supabase/client';
import type { SelfServiceAccountType } from './account-types';
import { describeAuthError } from './errors';
import { TERMS_VERSION } from '@/lib/legal';

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function siteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

export async function signIn(input: { email: string; password: string; remember: boolean }): Promise<AuthResult> {
  setRememberSession(input.remember);
  const { error } = await getSupabase().auth.signInWithPassword({ email: input.email, password: input.password });
  return error ? { ok: false, error: describeAuthError(error) } : { ok: true, data: undefined };
}

/**
 * Creates the account. The database trigger creates the profile from this
 * metadata and ignores any attempt to request 'admin'.
 * Returns needsEmailConfirmation=true when Supabase requires the user to click
 * the link in their email before they can sign in.
 */
export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  accountType: SelfServiceAccountType;
  /** Must be true: the form requires the 18+ / terms tick box. */
  acceptTerms: boolean;
}): Promise<AuthResult<{ needsEmailConfirmation: boolean }>> {
  if (!input.acceptTerms) return { ok: false, error: 'You must be 18 or older and accept the Terms of Use to create an account.' };
  setRememberSession(true);
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: siteUrl('/dashboard'),
      // The database records the 18+ / terms consent from these two fields (migration 0016).
      data: {
        full_name: input.fullName, phone: input.phone, account_type: input.accountType,
        terms_version: TERMS_VERSION, confirmed_adult: 'true',
      },
    },
  });
  if (error) return { ok: false, error: describeAuthError(error) };
  // With email confirmation on, Supabase returns a user with no identities for an
  // email that is already registered (to avoid revealing which emails exist).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { ok: false, error: 'An account with this email already exists. Try signing in instead.' };
  }
  return { ok: true, data: { needsEmailConfirmation: !data.session } };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut({ scope: 'local' });
}

/** Ends every session for this account (all phones and computers). */
export async function signOutEverywhere(): Promise<void> {
  await getSupabase().auth.signOut({ scope: 'global' });
}

/** Always reports success, so the form can't be used to discover registered emails. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl('/reset-password'),
  });
  if (error && (error.status === 429 || error.message.toLowerCase().includes('rate'))) {
    return { ok: false, error: describeAuthError(error) };
  }
  return { ok: true, data: undefined };
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: describeAuthError(error) } : { ok: true, data: undefined };
}

/** Re-checks the current password before changing it (settings page). */
export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
  const check = await getSupabase().auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) {
    return { ok: false, error: 'Your current password is incorrect.' };
  }
  return updatePassword(newPassword);
}

export async function resendConfirmation(email: string): Promise<AuthResult> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: siteUrl('/dashboard') },
  });
  return error ? { ok: false, error: describeAuthError(error) } : { ok: true, data: undefined };
}
