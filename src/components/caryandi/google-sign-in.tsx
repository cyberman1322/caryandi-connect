import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isGoogleSignInEnabled, signInWithGoogle } from '@/lib/auth/auth-service';
import type { SelfServiceAccountType } from '@/lib/auth/account-types';

/**
 * "Continue with Google". Renders nothing until Google sign-in is switched on in
 * Supabase (Auth → Providers → Google), so visitors never see a button that fails.
 */
export function GoogleSignIn({ next, accountType, dividerLabel = 'or use your email' }: {
  next?: string | undefined;
  accountType?: SelfServiceAccountType | undefined;
  dividerLabel?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void isGoogleSignInEnabled().then((on) => { if (active) setEnabled(on); });
    return () => { active = false; };
  }, []);

  if (!enabled) return null;

  async function start() {
    setBusy(true); setError(null);
    const result = await signInWithGoogle({ ...(next ? { next } : {}), ...(accountType ? { accountType } : {}) });
    // On success the browser is already on its way to Google.
    if (!result.ok) { setError(result.error); setBusy(false); }
  }

  return (
    <div className="mt-7 grid gap-4">
      <Button type="button" variant="outline" className="h-11 w-full font-semibold" disabled={busy} onClick={() => void start()}>
        {busy && <Loader2 className="animate-spin" />}Continue with Google
      </Button>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />{dividerLabel}<span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
