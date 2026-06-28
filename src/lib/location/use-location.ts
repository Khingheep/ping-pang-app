import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from './distance';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied';

export type UseLocation = {
  /** Position de l'utilisateur, ou null tant qu'on ne l'a pas (permission refusée / en cours). */
  coords: LatLng | null;
  status: LocationStatus;
  /** Demande explicite : peut afficher la pop-up système. À brancher sur un bouton « Activer ». */
  request: () => Promise<LatLng | null>;
};

/**
 * Position de l'utilisateur (foreground). Marche iOS/Android (expo-location) ET web/PWA.
 *
 * `auto` (défaut true) : récupère la position UNIQUEMENT si la permission est DÉJÀ accordée —
 * ne déclenche JAMAIS la pop-up système à froid (le priming se fait dans l'onboarding).
 * `request()` est la seule voie qui peut afficher la demande d'autorisation.
 */
export function useUserLocation(auto = true): UseLocation {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  const fetchPosition = useCallback(async (): Promise<LatLng | null> => {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const c: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setCoords(c);
    setStatus('granted');
    return c;
  }, []);

  const request = useCallback(async (): Promise<LatLng | null> => {
    try {
      setStatus('loading');
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('denied');
        return null;
      }
      return await fetchPosition();
    } catch {
      setStatus('denied');
      return null;
    }
  }, [fetchPosition]);

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    (async () => {
      try {
        const { status: perm } = await Location.getForegroundPermissionsAsync();
        if (perm === 'granted' && !cancelled) await fetchPosition();
      } catch {
        /* pas de position dispo, fallback silencieux */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auto, fetchPosition]);

  return { coords, status, request };
}
