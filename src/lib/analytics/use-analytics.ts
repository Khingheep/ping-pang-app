import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth/auth-provider';

import { analytics } from './analytics';

/**
 * Synchronise l'identité Supabase → analytics :
 * - `identify(userId)` au login (relie les events au joueur),
 * - `reset()` au logout (n'attribue pas les events au compte suivant).
 * À appeler une fois, à l'intérieur de l'AuthProvider.
 */
export function useAnalyticsIdentify(): void {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? undefined;
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (userId === prev.current) return;
    if (userId) {
      analytics.identify(userId, { email });
    } else if (prev.current) {
      analytics.reset();
    }
    prev.current = userId;
  }, [userId, email]);
}

/**
 * Track automatique des screen views via expo-router (autocapture est limité en RN,
 * donc on émet nous-mêmes une vue par changement de route).
 */
export function useScreenTracking(): void {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === prev.current) return;
    prev.current = pathname;
    analytics.screen(pathname);
  }, [pathname]);
}
