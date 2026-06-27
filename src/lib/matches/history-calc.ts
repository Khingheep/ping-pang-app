/**
 * Calculs PURS sur l'historique de matchs (aucune dépendance Supabase / RN) — testables.
 * `now` est injectable pour des tests déterministes (défaut = maintenant).
 */

import type { EloProgression, MatchView, PlayerStats } from './history';

/** Étiquette de format depuis best_of (7 = WTT officiel). */
export function formatFromBestOf(bestOf: number | null): string {
  if (bestOf === 7) return 'WTT';
  if (bestOf === 3) return 'Bo3';
  return 'Bo5';
}

/** Stats : seuls les matchs classés CONFIRMÉS comptent. */
export function computeStats(matches: MatchView[]): PlayerStats {
  const ranked = matches.filter((m) => m.ranked && m.status === 'confirmed');
  const total = ranked.length;
  const wins = ranked.filter((m) => m.won).length;
  return { total, wins, winPct: total > 0 ? Math.round((wins / total) * 100) : null };
}

/** Progression ELO : delta net par mois (6 derniers mois) + total du mois en cours. */
export function computeEloProgression(matches: MatchView[], now: Date = new Date()): EloProgression {
  const MONTHS = 6;
  const buckets = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('fr-FR', { month: 'short' }), delta: 0 };
  });
  for (const mt of matches) {
    if (mt.status !== 'confirmed' || !mt.ranked) continue;
    const d = new Date(mt.date);
    const b = buckets.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b.delta += mt.delta;
  }
  const thisMonth = buckets[buckets.length - 1]?.delta ?? 0;
  return { months: buckets.map((b) => ({ label: b.label, delta: b.delta })), thisMonth };
}

/** Somme des deltas ELO des matchs classés confirmés des 7 derniers jours. */
export function last7Delta(matches: MatchView[], nowMs: number = Date.now()): number {
  const cutoff = nowMs - 7 * 86400000;
  return matches
    .filter((m) => m.status === 'confirmed' && m.ranked && new Date(m.date).getTime() >= cutoff)
    .reduce((s, m) => s + m.delta, 0);
}
