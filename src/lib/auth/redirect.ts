/** Only allow redirects back into this site (blocks open-redirect tricks like //evil.com). */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  return value;
}
