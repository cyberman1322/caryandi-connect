import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabase, setRememberSession } from '@/lib/supabase/client';
import { SELF_SERVICE_ACCOUNT_TYPES, type SelfServiceAccountType } from './account-types';
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
      emailRedirectTo: siteUrl('/auth/confirm'),
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
    options: { emailRedirectTo: siteUrl('/auth/confirm') },
  });
  return error ? { ok: false, error: describeAuthError(error) } : { ok: true, data: undefined };
}

/* ------------------------------------------------ email confirmation ("Confirm it's me") */

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ['email', 'signup', 'invite', 'magiclink', 'recovery', 'email_change'];

/**
 * Called by /auth/confirm with the token from the confirmation email's button
 * ({{ .TokenHash }} in the Supabase email template). Confirms the address and signs the person in.
 */
export async function confirmEmail(tokenHash: string, type: string): Promise<AuthResult> {
  const otpType = (EMAIL_OTP_TYPES as readonly string[]).includes(type) ? (type as EmailOtpType) : 'email';
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    return { ok: false, error: 'This confirmation link is incomplete. Open the latest email from My Car Zambia and tap the button again.' };
  }
  setRememberSession(true);
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type: otpType });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired') || msg.includes('invalid') || error.status === 403) {
      return { ok: false, error: 'This confirmation link has expired or was already used. Sign in — if your email isn’t confirmed yet, we’ll offer to send a new link.' };
    }
    return { ok: false, error: describeAuthError(error) };
  }
  return { ok: true, data: undefined };
}

/**
 * Lets a "Check your email" screen in another tab of the same browser know the
 * email was confirmed, so it can move on straight away.
 */
const CONFIRMED_CHANNEL = 'mcz-email-confirmed';
export function announceEmailConfirmed(): void {
  try {
    const channel = new BroadcastChannel(CONFIRMED_CHANNEL);
    channel.postMessage('confirmed');
    channel.close();
  } catch {
    /* BroadcastChannel unsupported: the other tab still notices on its next check */
  }
}
export function onEmailConfirmedElsewhere(callback: () => void): () => void {
  try {
    const channel = new BroadcastChannel(CONFIRMED_CHANNEL);
    channel.onmessage = () => callback();
    return () => channel.close();
  } catch {
    return () => {};
  }
}

/* ---------------------------------------------------------------- Continue with Google */

const PENDING_TYPE_KEY = 'mcz:pending-account-type';
const PENDING_NEXT_KEY = 'mcz:pending-next';

/** True when Google sign-in has been switched on in Supabase (Auth → Providers). */
export async function isGoogleSignInEnabled(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return false;
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.['google'] === true;
  } catch {
    return false;
  }
}

/**
 * Sends the person to Google. New accounts are created by the same database
 * trigger as email sign-ups (as a buyer); the account type chosen on the sign-up
 * page is applied on return by applyPendingAccountType(). Google accounts never
 * saw the 18+ tick box, so the one-time terms prompt asks them after sign-in.
 */
export async function signInWithGoogle(options: { next?: string; accountType?: SelfServiceAccountType } = {}): Promise<AuthResult> {
  try {
    if (options.accountType) window.localStorage.setItem(PENDING_TYPE_KEY, options.accountType);
    else window.localStorage.removeItem(PENDING_TYPE_KEY);
    window.localStorage.setItem(PENDING_NEXT_KEY, options.next ?? '/dashboard');
  } catch {
    /* storage blocked: they land on the dashboard as a buyer and can change type later */
  }
  setRememberSession(true);
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: siteUrl('/auth/callback'), queryParams: { prompt: 'select_account' } },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not enabled') || msg.includes('unsupported provider')) {
      return { ok: false, error: 'Google sign-in isn’t available yet. Please use your email and password.' };
    }
    return { ok: false, error: describeAuthError(error) };
  }
  return { ok: true, data: undefined };
}

/** Where to go after returning from Google (a same-site path only). */
export function takePendingNext(): string {
  try {
    const next = window.localStorage.getItem(PENDING_NEXT_KEY);
    window.localStorage.removeItem(PENDING_NEXT_KEY);
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  } catch {
    /* ignore */
  }
  return '/dashboard';
}

/**
 * After a Google sign-up, switch the brand-new account from buyer to the type
 * picked on the sign-up page. Only for accounts created in the last 30 minutes
 * that are still buyers, so it can never change an established account.
 * Returns true when the type was changed.
 */
export async function applyPendingAccountType(profile: { id: string; account_type: string; created_at: string }): Promise<boolean> {
  let pending: string | null = null;
  try {
    pending = window.localStorage.getItem(PENDING_TYPE_KEY);
    window.localStorage.removeItem(PENDING_TYPE_KEY);
  } catch {
    return false;
  }
  if (!pending || pending === 'buyer' || !(SELF_SERVICE_ACCOUNT_TYPES as readonly string[]).includes(pending)) return false;
  const isNew = Date.now() - new Date(profile.created_at).getTime() < 30 * 60_000;
  if (!isNew || profile.account_type !== 'buyer') return false;
  const { error } = await getSupabase()
    .from('profiles')
    .update({ account_type: pending as SelfServiceAccountType })
    .eq('id', profile.id);
  return !error;
}
