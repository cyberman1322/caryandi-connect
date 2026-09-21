/** Minimal shape of a Supabase auth error (kept local so this stays testable). */
export type AuthErrorLike = { message: string; status?: number | undefined; code?: string | undefined };

/** Friendly messages for the errors people actually hit. Never leaks internals. */
export function describeAuthError(error: AuthErrorLike): string {
  const code = error.code ?? '';
  const message = error.message.toLowerCase();
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'That email and password don’t match. Check them and try again.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link we sent.';
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'weak_password' || message.includes('password should')) {
    return 'That password is too weak. Use at least 8 characters with letters and a number.';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (code === 'same_password') {
    return 'Your new password must be different from the old one.';
  }
  if (message.includes('fetch') || message.includes('network')) {
    return 'We couldn’t reach Caryandi. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
