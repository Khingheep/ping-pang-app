/**
 * Système ELO (style Chess.com) — Mission 01.
 * V1 : ELO simple K-factor. Glicko-2 envisagé en V2 (cf. vision.md §15).
 */

export const K_FACTOR = 32;

/** Probabilité que `rating` batte `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/** Nouveau rating après un match. */
export function nextElo(rating: number, opponent: number, didWin: boolean, k = K_FACTOR): number {
  return Math.round(rating + k * ((didWin ? 1 : 0) - expectedScore(rating, opponent)));
}

/** Deltas ELO pour les 2 joueurs d'un match. */
export function eloDeltas(ratingA: number, ratingB: number, winner: 'a' | 'b', k = K_FACTOR) {
  const aWon = winner === 'a';
  return {
    a: nextElo(ratingA, ratingB, aWon, k) - ratingA,
    b: nextElo(ratingB, ratingA, !aWon, k) - ratingB,
  };
}

/** Niveaux gamifiés (barre de progression ELO). */
export const LEVELS = [
  { key: 'rookie', label: 'Rookie', min: 0 },
  { key: 'amateur', label: 'Amateur', min: 1100 },
  { key: 'confirme', label: 'Confirmé', min: 1300 },
  { key: 'expert', label: 'Expert', min: 1500 },
  { key: 'master', label: 'Master', min: 1700 },
  { key: 'elite', label: 'Elite', min: 1900 },
  { key: 'legend', label: 'Legend', min: 2100 },
] as const;

export type Level = (typeof LEVELS)[number];

export function levelForElo(elo: number): Level {
  return [...LEVELS].reverse().find((l) => elo >= l.min) ?? LEVELS[0];
}

/** ELO de départ estimé à partir des points officiels FFTT (~500-4500 → ~1125-2125). */
export function ffttPointsToElo(points: number): number {
  return Math.min(2600, Math.max(800, Math.round(1000 + points / 4)));
}
