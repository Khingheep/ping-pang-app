import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Consentement analytics (RGPD, opt-in strict).
 *
 * Tant que l'utilisateur n'a pas explicitement accepté, rien n'est envoyé à PostHog
 * (la couche `analytics` no-op — cf. analytics.ts). État persisté dans AsyncStorage.
 */
export type AnalyticsConsent = 'granted' | 'denied' | 'unset';

const STORAGE_KEY = 'analytics_consent';
let consent: AnalyticsConsent = 'unset';
const listeners = new Set<(c: AnalyticsConsent) => void>();

/** Hydrate l'état depuis le stockage. À appeler une fois au boot (cf. _layout). */
export async function loadAnalyticsConsent(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === 'granted' || v === 'denied') {
      consent = v;
      emit();
    }
  } catch {
    // stockage indispo → on reste 'unset' (donc analytics off, côté sûr)
  }
}

export function getAnalyticsConsent(): AnalyticsConsent {
  return consent;
}

/** True seulement si l'utilisateur a explicitement accepté (RGPD opt-in). */
export function hasAnalyticsConsent(): boolean {
  return consent === 'granted';
}

/** Enregistre le choix de l'utilisateur (accepter / refuser) et le persiste. */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  consent = granted ? 'granted' : 'denied';
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, consent);
  } catch {
    // best effort
  }
}

export function subscribeAnalyticsConsent(fn: (c: AnalyticsConsent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  for (const fn of listeners) fn(consent);
}
