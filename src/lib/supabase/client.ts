import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type CaryandiClient = SupabaseClient<Database>;

const REMEMBER_KEY = 'caryandi.remember-session';

function readConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return { url, anonKey };
}

/**
 * "Remember me": when on, the session lives in localStorage and survives the
 * browser closing. When off, it lives in sessionStorage and ends with the tab.
 * Reads check both so an existing session is always found.
 */
export function setRememberSession(remember: boolean) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    /* storage unavailable (private mode): Supabase falls back to memory */
  }
}

function preferredStorage(): Storage {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '0' ? window.sessionStorage : window.localStorage;
  } catch {
    return window.sessionStorage;
  }
}

const rememberAwareStorage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      const target = preferredStorage();
      const other = target === window.localStorage ? window.sessionStorage : window.localStorage;
      other.removeItem(key);
      target.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let browserClient: CaryandiClient | undefined;

/**
 * The single Supabase client for the app.
 * - In the browser: keeps the signed-in session and refreshes it.
 * - During server rendering: a stateless anonymous client (public data only),
 *   created per call so no user's session can leak between requests.
 */
export function getSupabase(): CaryandiClient {
  const { url, anonKey } = readConfig();

  if (typeof window === 'undefined') {
    return createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  browserClient ??= createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Picks up the session from email confirmation and password-reset links.
      detectSessionInUrl: true,
      storage: rememberAwareStorage,
      storageKey: 'caryandi-auth',
    },
  });
  return browserClient;
}
