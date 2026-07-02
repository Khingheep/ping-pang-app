import { type Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ensurePlayerProfile, fetchMyProfile } from '@/lib/players/profile';
import { queryClient } from '@/lib/query/client';
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
  /** Crée le compte et retourne l'id du user si une session est ouverte (confirmation email off), sinon null. */
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  /** Passwordless : envoie un code à 6 chiffres par email (crée le compte si besoin). */
  sendEmailOtp: (email: string) => Promise<void>;
  /** Vérifie le code OTP → ouvre la session. Retourne l'id du user. */
  verifyEmailOtp: (email: string, token: string) => Promise<string | null>;
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
  // Une fois l'onboarding terminé localement, empêche l'effet auth de re-déclencher l'onboarding.
  const onboardedRef = useRef(false);

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
        .then((p) => {
          if (!onboardedRef.current) setNeedsOnboarding(!p?.onboarded);
        })
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (!error) return data.session ? (data.user?.id ?? null) : null; // session immédiate si confirmation off
        // Email déjà inscrit (422) → on tente de se connecter avec les mêmes identifiants.
        if (error.status === 422 || /already (registered|exists)|user already/i.test(error.message)) {
          const { data: si, error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw new Error('Cet email a déjà un compte. Vérifie ton mot de passe, ou connecte-toi.');
          return si.user?.id ?? null;
        }
        throw error;
      },
      async sendEmailOtp(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      },
      async verifyEmailOtp(email, token) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: token.trim(),
          type: 'email',
        });
        if (error) throw error;
        return data.user?.id ?? null;
      },
      async signOut() {
        onboardedRef.current = false;
        await supabase.auth.signOut();
        queryClient.clear(); // évite que le cache du compte précédent fuite vers le suivant
      },
      needsOnboarding,
      markOnboarded() {
        onboardedRef.current = true;
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
