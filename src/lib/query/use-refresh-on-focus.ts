import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Rejoue un refetch quand l'écran reçoit le focus (remplace l'ancien `useFocusEffect(load)`),
 * MAIS via react-query : si la query est encore "fresh" (staleTime non écoulé), `refetch()`
 * ne touche pas le réseau → retour d'onglet instantané depuis le cache.
 *
 * Le tout PREMIER focus est ignoré : `useQuery` a déjà déclenché le fetch initial au montage.
 * Sans ce garde, on ferait un double-fetch au démarrage de chaque écran.
 */
export function useRefreshOnFocus(refetch: () => unknown): void {
  const firstTime = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstTime.current) {
        firstTime.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
