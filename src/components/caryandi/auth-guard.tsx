import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Loader2, LockKeyhole, ShieldAlert, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';
import { useAuth } from '@/lib/auth/auth-context';
import { ACCOUNT_TYPE_LABELS, canOpenDashboardPath } from '@/lib/auth/account-types';
import { becomePrivateSeller } from '@/lib/auth/profile-service';
import { isAuthPage, safeRedirectPath } from '@/lib/auth/redirect';

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center"><Brand /></div>
        {children}
      </div>
    </main>
  );
}

export function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30" aria-busy="true">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" /> Loading your account…
      </div>
    </main>
  );
}

/**
 * Wraps signed-in areas. This is for a smooth experience only — the database's
 * row-level security is what actually stops people reading or changing data
 * that isn't theirs.
 */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const [switching, setSwitching] = useState(false);
  // The guard can stay mounted (or be mounted again) while the router moves to
  // /login, so the location it sees may already be the sign-in page. Redirect
  // once, only from the protected page, so the original destination is kept
  // and ?redirect= never nests into itself.
  const redirected = useRef(false);

  useEffect(() => {
    if (auth.status !== 'signed-out') {
      redirected.current = false;
      return;
    }
    if (redirected.current || isAuthPage(location.pathname)) return;
    redirected.current = true;
    const redirect = safeRedirectPath(location.href);
    void navigate({ to: '/login', search: redirect ? { redirect } : {}, replace: true });
  }, [auth.status, location.href, location.pathname, navigate]);

  if (auth.status === 'loading' || auth.status === 'signed-out') return <AuthLoading />;

  if (auth.status === 'error') {
    return (
      <Centered>
        <WifiOff className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">We couldn’t load your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">{auth.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => void auth.refreshAccount()}>Try again</Button>
          <Button variant="outline" onClick={() => void auth.signOut()}>Sign out</Button>
        </div>
      </Centered>
    );
  }

  const { profile } = auth.account;

  if (profile.account_status !== 'active') {
    return (
      <Centered>
        <ShieldAlert className="mx-auto size-9 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">
          {profile.account_status === 'banned' ? 'This account has been closed' : 'This account is suspended'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          If you think this is a mistake, contact Caryandi support.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => void auth.signOut()}>Sign out</Button>
      </Centered>
    );
  }

  if (admin && profile.account_type !== 'admin') {
    return (
      <Centered>
        <LockKeyhole className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Administrators only</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account doesn’t have access to this area.</p>
        <Button className="mt-5" asChild><Link to="/dashboard">Go to your dashboard</Link></Button>
      </Centered>
    );
  }

  if (!admin && !canOpenDashboardPath(profile.account_type, location.pathname)) {
    const isSellingPage = ['/dashboard/add-vehicle', '/dashboard/listings'].includes(location.pathname);
    const canBecomeSeller = profile.account_type === 'buyer' && isSellingPage;
    return (
      <Centered>
        <LockKeyhole className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">
          {canBecomeSeller ? 'Sell your car on Caryandi' : 'Not available for your account'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canBecomeSeller
            ? 'To list a car, switch your account to a private seller account. You can still browse and save cars.'
            : `This page isn’t part of a ${ACCOUNT_TYPE_LABELS[profile.account_type].toLowerCase()} account.`}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {canBecomeSeller && (
            <Button
              disabled={switching}
              onClick={async () => {
                setSwitching(true);
                try {
                  await becomePrivateSeller(profile.id);
                  await auth.refreshAccount();
                } finally {
                  setSwitching(false);
                }
              }}
            >
              {switching && <Loader2 className="animate-spin" />}Switch to private seller
            </Button>
          )}
          <Button variant="outline" asChild><Link to="/dashboard">Back to dashboard</Link></Button>
        </div>
      </Centered>
    );
  }

  return <>{children}</>;
}
