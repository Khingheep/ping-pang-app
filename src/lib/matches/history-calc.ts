/**
 * Calculs PURS sur l'historique de matchs (aucune dépendance Supabase / RN) - testables.
 * `now` est injectable pour des tests déterministes (défaut = maintenant).
 */

import type { EloProgression, MatchView, PlayerStats, RatingPoint } from './history';

/** Étiquette de format depuis best_of. */
export function formatFromBestOf(bestOf: number | null): string {
  if (bestOf === 7) return 'BO7';
  if (bestOf === 3) return 'BO3';
  return 'BO5';
}

/** Stats : seuls les matchs classés CONFIRMÉS comptent. */
export function computeStats(matches: MatchView[]): PlayerStats {
  const ranked = matches.filter((m) => m.ranked && m.status === 'confirmed');
  const total = ranked.length;
  const wins = ranked.filter((m) => m.won).length;
  return { total, wins, winPct: total > 0 ? Math.round((wins / total) * 100) : null };
}

/**
 * Progression ELO dérivée de l'historique de rating (fiable — cf. table `rating_history`),
 * et NON de la somme des elo_delta des matchs (qui peut diverger du rating réel).
 * - `series` : suite d'ELO (chronologique, du plus ancien au plus récent) pour tracer la courbe,
 *   terminée par l'ELO courant. `history` doit être trié par date croissante.
 * - `thisMonth` : ELO courant − ELO au 1er du mois en cours (dernier snapshot antérieur, sinon le
 *   plus ancien snapshot connu).
 */
export function buildEloProgression(
  history: RatingPoint[],
  currentElo: number,
  now: Date = new Date(),
): EloProgression {
  const series = history.map((p) => p.elo);
  if (series.length === 0 || series[series.length - 1] !== currentElo) series.push(currentElo);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const before = history.filter((p) => new Date(p.at).getTime() < monthStart);
  const base = before.length ? before[before.length - 1].elo : history[0]?.elo ?? currentElo;
  return { series, thisMonth: currentElo - base };
}

// NB : le delta ELO « 7 derniers jours » (ex-`last7Delta`) n'est plus calculé ici non plus.
// Il est dérivé de l'historique de rating côté serveur — voir `fetchEloDelta`/`useEloDelta`
// (RPC `elo_delta_since`) et la migration 0054_rating_history.
