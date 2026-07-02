import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

/**
 * Singleton QueryClient. Exporté comme module (pas créé dans un composant) pour être
 * accessible hors React - notamment `queryClient.clear()` au signOut (auth-provider),
 * afin que le cache du compte A ne fuite pas vers le compte B.
 *
 * Pas de persistance disque dans cette version : le cache mémoire suffit à tuer le
 * double-fetch intra-session, et la persistance ajoute des risques (fuite inter-comptes,
 * démarrage PWA bloquant). À réévaluer si on veut un cold-start offline-first.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1, // Supabase échoue rarement de façon transitoire
      refetchOnReconnect: true,
      // Natif : pas de "window focus" → le refocus est géré par le focus d'écran
      // (useRefreshOnFocus) + AppState (focusManager, branché dans _layout).
      // Web/PWA : on garde le vrai focus de fenêtre (comportement attendu).
      refetchOnWindowFocus: Platform.OS === 'web',
    },
  },
});
