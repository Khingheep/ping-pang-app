import { supabase } from '@/lib/supabase/client';

export type MatchView = {
  id: string;
  opponent: string;
  score: string;
  won: boolean;
  delta: number;
  ranked: boolean;
  date: string;
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
  winner: string | null;
  is_ranked: boolean;
  elo_delta_a: number | null;
  elo_delta_b: number | null;
  played_at: string;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};

/** Matchs récents du user (RLS = seulement les siens), vus de SON point de vue. */
export async function fetchRecentMatches(userId: string, limit = 50): Promise<MatchView[]> {
  const { data } = await supabase
    .from('matches')
    .select(
      'id, player_a, player_b, score, winner, is_ranked, elo_delta_a, elo_delta_b, played_at, a:player_a(display_name), b:player_b(display_name)',
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
    return { id: r.id, opponent, score, won, delta, ranked: r.is_ranked, date: r.played_at };
  });
}

export function computeStats(matches: MatchView[]): PlayerStats {
  const ranked = matches.filter((m) => m.ranked);
  const total = ranked.length;
  const wins = ranked.filter((m) => m.won).length;
  return { total, wins, winPct: total > 0 ? Math.round((wins / total) * 100) : null };
}
