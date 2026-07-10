/**
 * Système ELO — paramètres Paul (06/07/2026). Remplace le K=32 fixe de la V1
 * et le Glicko-2 (migrations 0013→0058) :
 *
 *   ELO départ = points FFTT + 500, sinon 1000
 *   ELO après  = ELO + K × Poids × (Résultat - P)
 *   K          = 80 (0-5 matchs app joués) · 50 (6-10) · 30 (11+)
 *   Poids      = 1 (match app) · 1.2 (match FFTT)
 *
 * Le calcul qui fait foi est côté Postgres (_settle_match / apply_fftt_matches,
 * migration 0059) — cette lib sert aux previews et affichages client.
 * Simulations & analyse : scripts/test-elo-proposal.mjs + taches/elo-params-paul.md.
 */

export type MatchSource = 'app' | 'fftt';

export const START_ELO_DEFAULT = 1000;
export const FFTT_START_OFFSET = 500;

export const WEIGHTS: Record<MatchSource, number> = { app: 1, fftt: 1.2 };

/** ELO de départ : points FFTT + 500 si licencié, sinon 1000. */
export function startingElo(ffttPoints?: number | null): number {
  if (ffttPoints == null || !Number.isFinite(ffttPoints) || ffttPoints <= 0) {
    return START_ELO_DEFAULT;
  }
  return Math.round(ffttPoints + FFTT_START_OFFSET);
}

/** K dégressif selon le nombre de matchs app déjà joués (avant ce match). */
export function kFactor(appMatchesPlayed: number): number {
  if (appMatchesPlayed <= 5) return 80;
  if (appMatchesPlayed <= 10) return 50;
  return 30;
}

/** Probabilité que `rating` batte `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/** Delta ELO (non arrondi) pour un match. `result` : 1 = victoire, 0 = défaite. */
export function eloDelta(
  rating: number,
  opponent: number,
  result: 0 | 1,
  appMatchesPlayed: number,
  source: MatchSource = 'app',
): number {
  return kFactor(appMatchesPlayed) * WEIGHTS[source] * (result - expectedScore(rating, opponent));
}

/** Nouveau rating (arrondi) après un match. */
export function nextElo(
  rating: number,
  opponent: number,
  didWin: boolean,
  appMatchesPlayed: number,
  source: MatchSource = 'app',
): number {
  return Math.round(rating + eloDelta(rating, opponent, didWin ? 1 : 0, appMatchesPlayed, source));
}

/**
 * Deltas des 2 joueurs d'un match app. Zéro-somme uniquement si les deux
 * joueurs sont au même palier K — propriété voulue du K dégressif : un
 * nouveau gagne/perd plus vite qu'un établi.
 */
export function eloDeltas(
  ratingA: number,
  ratingB: number,
  winner: 'a' | 'b',
  aMatchesPlayed: number,
  bMatchesPlayed: number,
) {
  const aWon = winner === 'a';
  return {
    a: nextElo(ratingA, ratingB, aWon, aMatchesPlayed) - ratingA,
    b: nextElo(ratingB, ratingA, !aWon, bMatchesPlayed) - ratingB,
  };
}

/** Niveaux gamifiés (barre de progression ELO) — miroir de _level_for_elo (0059). */
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

export type Objective = { target: number; toGain: number; pct: number; nextLabel: string | null };

/**
 * Objectif gamifié : prochain palier de niveau au-dessus de l'ELO actuel
 * (ou la centaine suivante si déjà au dernier niveau). `pct` = avancement dans la tranche.
 */
export function computeObjective(elo: number): Objective {
  const current = levelForElo(elo);
  const next = LEVELS.find((l) => l.min > elo) ?? null;
  const target = next ? next.min : Math.ceil((elo + 1) / 100) * 100;
  const floor = current.min;
  const pct = Math.max(0, Math.min(1, (elo - floor) / Math.max(1, target - floor)));
  return { target, toGain: Math.max(0, target - elo), pct, nextLabel: next?.label ?? null };
}

/**
 * Objectif d'ELO fixé manuellement : progression de `start` (ELO au moment où l'objectif
 * a été posé) vers `target`. `nextLabel` reprend le palier de niveau correspondant à la cible.
 */
export function manualObjective(elo: number, target: number, start: number): Objective {
  const span = Math.max(1, target - start);
  const pct = Math.max(0, Math.min(1, (elo - start) / span));
  return { target, toGain: Math.max(0, target - elo), pct, nextLabel: levelForElo(target).label };
}
