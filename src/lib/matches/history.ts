import { formatFromBestOf } from '@/lib/matches/history-calc';
import { flipSetScores } from '@/lib/matches/sets';
import { supabase } from '@/lib/supabase/client';

export { computeEloProgression, computeStats, formatFromBestOf, last7Delta } from '@/lib/matches/history-calc';

export type MatchStatus = 'pending' | 'confirmed' | 'disputed';

export type MatchView = {
  id: string;
  opponent: string;
  opponentId: string;
  score: string;
  setScores: string | null; // détail des manches, vu de MON côté ("11-7,9-11,…")
  won: boolean;
  delta: number;
  ranked: boolean;
  date: string;
  status: MatchStatus;
  iProposed: boolean; // flux de confirmation : player_a = proposeur
  format: string; // WTT | Bo5 | Bo3 (depuis best_of)
  likeCount: number;
  liked: boolean;
  commentCount: number;
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
  if (!rows.length) return [];

  // Likes & commentaires en bloc (un seul aller-retour chacun).
  const ids = rows.map((r) => r.id);
  const [{ data: likeData }, { data: commentData }] = await Promise.all([
    supabase.from('match_likes').select('match_id, player_id').in('match_id', ids),
    supabase.from('match_comments').select('match_id').in('match_id', ids),
  ]);
  const likes = (likeData as { match_id: string; player_id: string }[] | null) ?? [];
  const likeCounts = new Map<string, number>();
  const myLikes = new Set<string>();
  for (const l of likes) {
    likeCounts.set(l.match_id, (likeCounts.get(l.match_id) ?? 0) + 1);
    if (l.player_id === userId) myLikes.add(l.match_id);
  }
  const commentCounts = new Map<string, number>();
  for (const c of (commentData as { match_id: string }[] | null) ?? []) {
    commentCounts.set(c.match_id, (commentCounts.get(c.match_id) ?? 0) + 1);
  }

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
      opponentId: (iAmA ? r.player_b : r.player_a) ?? '',
      score,
      setScores,
      won,
      delta,
      ranked: r.is_ranked,
      date: r.played_at,
      status: r.status ?? 'confirmed',
      iProposed: iAmA,
      format: formatFromBestOf(r.best_of),
      likeCount: likeCounts.get(r.id) ?? 0,
      liked: myLikes.has(r.id),
      commentCount: commentCounts.get(r.id) ?? 0,
    };
  });
}

/** Un match unique vu de MON côté (pour l'écran détail). RLS = seulement si j'y participe. */
export async function fetchMatchItem(matchId: string, userId: string): Promise<MatchView | null> {
  const { data } = await supabase
    .from('matches')
    .select(
      'id, player_a, player_b, score, set_scores, winner, is_ranked, elo_delta_a, elo_delta_b, status, best_of, played_at, a:player_a(display_name), b:player_b(display_name)',
    )
    .eq('id', matchId)
    .maybeSingle();
  const r = data as unknown as Row | null;
  if (!r) return null;

  const [{ data: likeData }, { count: commentCount }] = await Promise.all([
    supabase.from('match_likes').select('player_id').eq('match_id', matchId),
    supabase.from('match_comments').select('id', { count: 'exact', head: true }).eq('match_id', matchId),
  ]);
  const likes = (likeData as { player_id: string }[] | null) ?? [];

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
    opponentId: (iAmA ? r.player_b : r.player_a) ?? '',
    score,
    setScores,
    won,
    delta,
    ranked: r.is_ranked,
    date: r.played_at,
    status: r.status ?? 'confirmed',
    iProposed: iAmA,
    format: formatFromBestOf(r.best_of),
    likeCount: likes.length,
    liked: likes.some((l) => l.player_id === userId),
    commentCount: commentCount ?? 0,
  };
}

export type EloProgression = { months: { label: string; delta: number }[]; thisMonth: number };
