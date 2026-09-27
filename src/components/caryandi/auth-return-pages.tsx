import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from './brand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { announceEmailConfirmed, applyPendingAccountType, confirmEmail, takePendingNext } from '@/lib/auth/auth-service';

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-lg">
        <div className="flex justify-center"><Brand /></div>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

function Working({ text }: { text: string }) {
  return <p className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" />{text}</p>;
}

function Problem({ message }: { message: string }) {
  return (
    <>
      <TriangleAlert className="mx-auto size-12 text-destructive" />
      <h1 className="mt-4 text-2xl font-bold">That didn’t work</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <Button asChild className="mt-6 h-11 w-full"><Link to="/login">Go to sign in</Link></Button>
    </>
  );
}

/* ------------------------------------------------------------ /auth/confirm */

/** Where the "Confirm it's me" button in the sign-up email lands. */
export function ConfirmEmailPage({ tokenHash, type }: { tokenHash?: string | undefined; type?: string | undefined }) {
  const auth = useAuth();
  const [state, setState] = useState<{ kind: 'working' } | { kind: 'done' } | { kind: 'error'; message: string }>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (tokenHash) {
      started.current = true;
      void confirmEmail(tokenHash, type ?? 'email').then((result) => {
        if (result.ok) { announceEmailConfirmed(); setState({ kind: 'done' }); }
        else setState({ kind: 'error', message: result.error });
      });
      return;
    }
    // Older emails put the session in the link itself; the Supabase client picks it up.
    if (auth.status === 'signed-in') { started.current = true; announceEmailConfirmed(); setState({ kind: 'done' }); }
    else if (auth.status === 'signed-out') {
      started.current = true;
      setState({ kind: 'error', message: 'This confirmation link is incomplete or has expired. Sign in — if your email isn’t confirmed yet, we’ll offer to send a new link.' });
    }
  }, [tokenHash, type, auth.status]);

  if (state.kind === 'working') return <Shell><Working text="Confirming your email…" /></Shell>;
  if (state.kind === 'error') return <Shell><Problem message={state.message} /></Shell>;
  return (
    <Shell>
      <CheckCircle2 className="mx-auto size-14 text-success" />
      <h1 className="mt-4 text-2xl font-bold">You’re verified</h1>
      <p className="mt-2 text-muted-foreground">Thanks for confirming your email. Your My Car Zambia account is active and you’re signed in.</p>
      <Button asChild className="mt-6 h-11 w-full"><Link to="/dashboard">Continue to my account</Link></Button>
      <p className="mt-3 text-xs text-muted-foreground">If you signed up in another tab, it has moved on too — you can close this one.</p>
    </Shell>
  );
}

/* ----------------------------------------------------------- /auth/callback */

/** Where Google sends people back after "Continue with Google". */
export function OAuthCallbackPage({ error }: { error?: string | undefined }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (handled.current || error || auth.status !== 'signed-in') return;
    handled.current = true;
    void (async () => {
      const changed = await applyPendingAccountType(auth.account.profile);
      if (changed) await auth.refreshAccount();
      toast.success(`Welcome${auth.account.profile.full_name ? `, ${auth.account.profile.full_name.split(' ')[0]}` : ''}!`);
      await navigate({ to: takePendingNext(), replace: true });
    })();
  }, [auth, error, navigate]);

  if (error) {
    const cancelled = /access_denied|cancel/i.test(error);
    return <Shell><Problem message={cancelled ? 'Google sign-in was cancelled. You can try again or use your email and password.' : 'Google couldn’t sign you in. Please try again, or use your email and password.'} /></Shell>;
  }
  if (auth.status === 'error') return <Shell><Problem message={auth.message} /></Shell>;
  if (timedOut && auth.status !== 'signed-in') return <Shell><Problem message="We couldn’t finish signing you in with Google. Please try again." /></Shell>;
  return <Shell><Working text="Signing you in…" /></Shell>;
}
