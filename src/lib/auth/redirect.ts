/** Pages that must never be a post-sign-in destination (sending someone back to them loops). */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Only allow redirects back into this site (blocks open-redirect tricks like //evil.com),
 * and never back to a sign-in page — that would nest ?redirect= inside itself forever.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  const path = value.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/';
  if (AUTH_PAGES.includes(path.toLowerCase())) return undefined;
  return value;
}
