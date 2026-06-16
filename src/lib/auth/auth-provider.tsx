import { type Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ensurePlayerProfile, fetchMyProfile } from '@/lib/players/profile';
import { registerForPush } from '@/lib/push/register';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

export type AuthProviderId = 'google' | 'apple';

type AuthContextValue = {
  session: Session | null;
  /** true tant qu'on n'a pas résolu l'état de session initial */
  loading: boolean;
  signIn: (provider: AuthProviderId) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  needsOnboarding: boolean;
  markOnboarded: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Extrait les tokens d'une URL de redirection OAuth et ouvre la session Supabase. */
async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // État de session initial + abonnement aux changements.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Récupère les tokens si l'app est ré-ouverte via le deep link OAuth.
  const url = Linking.useURL();
  useEffect(() => {
    if (url) {
      createSessionFromUrl(url).catch(() => {});
    }
  }, [url]);

  // À la connexion : garantit le profil joueur + détecte si onboarding requis.
  useEffect(() => {
    const user = session?.user;
    if (user) {
      ensurePlayerProfile(user)
        .then(() => {
          registerForPush(user.id).catch(() => {}); // no-op sur Expo Go
          return fetchMyProfile(user.id);
        })
        .then((p) => setNeedsOnboarding(!p?.onboarded))
        .catch(() => {});
    } else {
      setNeedsOnboarding(false);
    }
  }, [session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async signIn(provider) {
        const redirectTo = makeRedirectUri();
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data?.url) throw new Error('URL OAuth manquante');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          await createSessionFromUrl(result.url);
        }
      },
      async signInWithEmail(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUpWithEmail(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      needsOnboarding,
      markOnboarded() {
        setNeedsOnboarding(false);
      },
    }),
    [session, loading, needsOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  }
  return ctx;
}

/** Re-export pratique pour le gating (ex: bypass tant que le projet Supabase n'est pas branché). */
export { isSupabaseConfigured };
