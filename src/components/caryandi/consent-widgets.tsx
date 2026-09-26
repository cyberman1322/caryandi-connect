import { useEffect, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cookie, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { signOut } from '@/lib/auth/auth-service';
import { getSupabase } from '@/lib/supabase/client';
import { MINIMUM_AGE, TERMS_VERSION } from '@/lib/legal';

const LEGAL_PATHS = new Set(['/terms', '/privacy', '/cookies']);

async function myConsentVersion(uid: string): Promise<string | null> {
  const { data, error } = await getSupabase().from('profile_consents').select('terms_version').eq('profile_id', uid).maybeSingle();
  if (error) throw error;
  return data?.terms_version ?? null;
}

/**
 * Accounts created before the terms existed (or before a new version) are asked once to
 * confirm they are 18+ and accept the terms. The database refuses listing, messaging and
 * verification until they do (migration 0016), so this can't be skipped by the app.
 */
export function TermsConsentGate() {
  const auth = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const uid = auth.status === 'signed-in' ? auth.session.user.id : null;
  const consent = useQuery({
    queryKey: ['terms-consent', uid ?? 'anon'],
    queryFn: () => myConsentVersion(uid!),
    enabled: Boolean(uid),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConsent = Boolean(uid) && consent.isSuccess && consent.data !== TERMS_VERSION
    && auth.status === 'signed-in' && auth.account.profile.account_type !== 'admin';
  if (!needsConsent || LEGAL_PATHS.has(path)) return null;

  const accept = async () => {
    setBusy(true); setError(null);
    const { error: e } = await getSupabase().rpc('accept_terms', { p_version: TERMS_VERSION, p_confirm_adult: true });
    setBusy(false);
    if (e) { setError(e.message || 'That didn’t work. Please try again.'); return; }
    await queryClient.invalidateQueries({ queryKey: ['terms-consent'] });
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Before you continue</AlertDialogTitle>
          <AlertDialogDescription>
            Caryandi is for adults only. Please confirm your age and accept our terms to keep listing, messaging and using your account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <span>I am {MINIMUM_AGE} or older and I agree to the <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Use</Link> and <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.</span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
          <Button disabled={!checked || busy} onClick={() => void accept()}>{busy && <Loader2 className="animate-spin" />}Accept and continue</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const NOTICE_KEY = 'caryandi:cookie-notice';

/** We only use essential storage, so this is a notice (not a consent choice). Shown once per browser. */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(window.localStorage.getItem(NOTICE_KEY) !== '1'); } catch { setShow(false); }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try { window.localStorage.setItem(NOTICE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };
  return (
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg border bg-card p-4 shadow-lg sm:inset-x-6">
      <div className="flex gap-3">
        <Cookie className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          We use only essential cookies and browser storage to keep you signed in and remember your settings. No advertising trackers.{' '}
          <Link to="/cookies" className="font-medium text-primary hover:underline">Cookie Policy</Link>
        </p>
      </div>
      <div className="mt-3 flex justify-end"><Button size="sm" onClick={dismiss}>OK</Button></div>
    </div>
  );
}
