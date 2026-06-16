import { supabase } from '@/lib/supabase/client';

export type MatchStatus = 'pending' | 'confirmed' | 'disputed';

export type MatchView = {
  id: string;
  opponent: string;
  score: string;
  won: boolean;
  delta: number;
  ranked: boolean;
  date: string;
  status: MatchStatus;
  iProposed: boolean; // flux de confirmation : player_a = proposeur
  format: string; // WTT | Bo5 | Bo3 (depuis best_of)
};

/** Étiquette de format depuis best_of (7 = WTT officiel). */
export function formatFromBestOf(bestOf: number | null): string {
  if (bestOf === 7) return 'WTT';
  if (bestOf === 3) return 'Bo3';
  return 'Bo5';
}

export type PlayerStats = {
  total: number;
  wins: number;
  winPct: number | null;
};

type Row = {
  id: string;
  player_a: string;
  player_b: string;
  score: string | null;
  winner: string | null;
  is_ranked: boolean;
  elo_delta_a: number | null;
  elo_delta_b: number | null;
  status: MatchStatus | null;
  best_of: number | null;
  played_at: string;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};

/** Matchs récents du user (RLS = seulement les siens), vus de SON point de vue. */
export async function fetchRecentMatches(userId: string, limit = 50): Promise<MatchView[]> {
  const { data } = await supabase
    .from('matches')
    .select(
      'id, player_a, player_b, score, winner, is_ranked, elo_delta_a, elo_delta_b, status, best_of, played_at, a:player_a(display_name), b:player_b(display_name)',
    )
    .order('played_at', { ascending: false })
    .limit(limit);

  const rows = (data as unknown as Row[] | null) ?? [];
  return rows.map((r) => {
    const iAmA = r.player_a === userId;
    const opponent = (iAmA ? r.b : r.a)?.display_name ?? 'Joueur';
    const won = r.winner === userId;
    const delta = (iAmA ? r.elo_delta_a : r.elo_delta_b) ?? 0;
    let score = r.score ?? '';
    if (!iAmA && score.includes('-')) {
      const [x, y] = score.split('-');
      score = `${y}-${x}`;
    }
    return {
      id: r.id,
      opponent,
      score,
      won,
      delta,
      ranked: r.is_ranked,
      date: r.played_at,
      status: r.status ?? 'confirmed',
      iProposed: iAmA,
      format: formatFromBestOf(r.best_of),
    };
  });
}

export type EloProgression = { months: { label: string; delta: number }[]; thisMonth: number };

/** Progression ELO : delta net par mois (6 derniers mois) + total du mois en cours. */
export function computeEloProgression(matches: MatchView[]): EloProgression {
  const now = new Date();
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

export function computeStats(matches: MatchView[]): PlayerStats {
  // Seuls les matchs classés CONFIRMÉS comptent dans les stats.
  const ranked = matches.filter((m) => m.ranked && m.status === 'confirmed');
  const total = ranked.length;
  const wins = ranked.filter((m) => m.won).length;
  return { total, wins, winPct: total > 0 ? Math.round((wins / total) * 100) : null };
}
