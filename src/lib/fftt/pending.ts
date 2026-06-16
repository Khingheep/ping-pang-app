import type { FfttPlayer } from '@/lib/fftt/link';

// Relais éphémère entre l'écran de recherche FFTT et l'onboarding (pas de session/DB
// pendant l'onboarding : on renvoie juste le joueur choisi).
let pending: FfttPlayer | null = null;

export function setPendingFftt(p: FfttPlayer | null): void {
  pending = p;
}

/** Récupère (et consomme) le joueur FFTT choisi. */
export function takePendingFftt(): FfttPlayer | null {
  const p = pending;
  pending = null;
  return p;
}
