/** Pages that must never be a post-sign-in destination (sending someone back to them loops). */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

/** True for the sign-in / sign-up / password pages. Accepts a path with or without ?query / #hash. */
export function isAuthPage(pathOrHref: string): boolean {
  const path = pathOrHref.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/';
  return AUTH_PAGES.includes(path.toLowerCase());
}

/**
 * Only allow redirects back into this site (blocks open-redirect tricks like //evil.com),
 * and never back to a sign-in page — that would nest ?redirect= inside itself forever.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (isAuthPage(value)) return undefined;
  return value;
}
