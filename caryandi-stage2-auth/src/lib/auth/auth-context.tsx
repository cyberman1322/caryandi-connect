import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { fetchMyAccount, type MyAccount } from './profile-service';
import { signOut as signOutRequest } from './auth-service';

type AuthState =
  /** First render (server and browser) until the stored session has been read. */
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, but the profile could not be loaded (e.g. offline). */
  | { status: 'error'; session: Session; message: string }
  | { status: 'signed-in'; session: Session; account: MyAccount };

type AuthContextValue = AuthState & {
  /** True right after following a password-reset email link. */
  passwordRecovery: boolean;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const loadingFor = useRef<string | null>(null);

  const loadAccount = useCallback(async (session: Session | null) => {
    if (!session) {
      loadingFor.current = null;
      setState({ status: 'signed-out' });
      return;
    }
    const requestKey = `${session.user.id}:${session.access_token.slice(-12)}`;
    loadingFor.current = requestKey;
    try {
      const account = await fetchMyAccount(session.user.id);
      if (loadingFor.current === requestKey) setState({ status: 'signed-in', session, account });
    } catch {
      if (loadingFor.current === requestKey) {
        setState({ status: 'error', session, message: 'We couldn’t load your account. Check your connection and try again.' });
      }
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadAccount(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      // Token refreshes don't change who is signed in; skip the extra profile fetch.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      // Defer so we never call Supabase from inside its own auth callback.
      setTimeout(() => void loadAccount(session), 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const refreshAccount = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    await loadAccount(data.session);
  }, [loadAccount]);

  const signOut = useCallback(async () => {
    await signOutRequest();
    loadingFor.current = null;
    setState({ status: 'signed-out' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, passwordRecovery, refreshAccount, signOut }),
    [state, passwordRecovery, refreshAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Convenience for components that only render when signed in. */
export function useSignedInAccount(): MyAccount | null {
  const auth = useAuth();
  return auth.status === 'signed-in' ? auth.account : null;
}
