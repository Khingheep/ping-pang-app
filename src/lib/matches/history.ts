import { formatFromBestOf } from '@/lib/matches/history-calc';
import { flipSetScores } from '@/lib/matches/sets';
import { supabase } from '@/lib/supabase/client';

export { computeEloProgression, computeStats, formatFromBestOf, last7Delta } from '@/lib/matches/history-calc';

export type MatchStatus = 'pending' | 'confirmed' | 'disputed';

export type MatchView = {
  id: string;
  opponent: string;
  score: string;
  setScores: string | null; // détail des manches, vu de MON côté ("11-7,9-11,…")
  won: boolean;
  delta: number;
  ranked: boolean;
  date: string;
  status: MatchStatus;
  iProposed: boolean; // flux de confirmation : player_a = proposeur
  format: string; // WTT | Bo5 | Bo3 (depuis best_of)
};

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
  set_scores: string | null;
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
      'id, player_a, player_b, score, set_scores, winner, is_ranked, elo_delta_a, elo_delta_b, status, best_of, played_at, a:player_a(display_name), b:player_b(display_name)',
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
    const setScores = iAmA ? r.set_scores : flipSetScores(r.set_scores) || null;
    return {
      id: r.id,
      opponent,
      score,
      setScores,
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
