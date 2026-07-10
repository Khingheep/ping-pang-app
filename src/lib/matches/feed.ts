/**
 * Feed GLOBAL des matchs (tous les joueurs), façon scoreboard joueur A vs joueur B.
 * Lecture autorisée par la RLS "read confirmed matches" (matchs confirmés world-readable).
 * set_scores est stocké du point de vue de player_a → le joueur A est toujours la ligne du haut.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { formatFromBestOf } from '@/lib/matches/history-calc';
import { likeMatch, unlikeMatch } from '@/lib/matches/social';
import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type MatchFeedPlayer = { id: string; name: string; avatarUrl: string | null };

export type MatchFeedItem = {
  id: string;
  kind: 'app' | 'fftt'; // 'app' = match joué dans l'app (scoreboard + social) ; 'fftt' = officiel FFTT (V/D)
  playerA: MatchFeedPlayer;
  playerB: MatchFeedPlayer;
  setScores: string | null; // détail des manches, vu de player_a ("11-7,9-11,…")
  score: string; // "3-2" vu de player_a
  winnerIsA: boolean;
  ranked: boolean;
  date: string;
  format: string; // BO7 | BO5 | BO3
  likeCount: number;
  liked: boolean;
  commentCount: number;
  opponentRank?: string | null; // FFTT uniquement : classement officiel de l'adversaire ("N26", "12"…)
};

type Row = {
  id: string;
  player_a: string;
  player_b: string;
  score: string | null;
  set_scores: string | null;
  winner: string | null;
  is_ranked: boolean;
  best_of: number | null;
  played_at: string;
  a: { id: string; display_name: string; avatar_url: string | null } | null;
  b: { id: string; display_name: string; avatar_url: string | null } | null;
};

const SELECT =
  'id, player_a, player_b, score, set_scores, winner, is_ranked, best_of, played_at, a:player_a(id, display_name, avatar_url), b:player_b(id, display_name, avatar_url)';

function toPlayer(p: { id: string; display_name: string; avatar_url: string | null } | null, fallbackId: string): MatchFeedPlayer {
  return { id: p?.id ?? fallbackId, name: p?.display_name ?? 'Joueur', avatarUrl: p?.avatar_url ?? null };
}

function mapRow(r: Row, like: { count: number; liked: boolean }, commentCount: number): MatchFeedItem {
  return {
    id: r.id,
    kind: 'app',
    playerA: toPlayer(r.a, r.player_a),
    playerB: toPlayer(r.b, r.player_b),
    setScores: r.set_scores,
    score: r.score ?? '',
    winnerIsA: r.winner === r.player_a,
    ranked: r.is_ranked,
    date: r.played_at,
    format: formatFromBestOf(r.best_of),
    likeCount: like.count,
    liked: like.liked,
    commentCount,
  };
}

/** Matchs APP confirmés (les plus récents d'abord), avec compteurs sociaux. */
async function fetchAppMatchesFeed(myId: string | undefined, limit = 40): Promise<MatchFeedItem[]> {
  const { data } = await supabase
    .from('matches')
    .select(SELECT)
    .eq('status', 'confirmed')
    .order('played_at', { ascending: false })
    .limit(limit);

  const rows = (data as unknown as Row[] | null) ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: likeData }, { data: commentData }] = await Promise.all([
    supabase.from('match_likes').select('match_id, player_id').in('match_id', ids),
    supabase.from('match_comments').select('match_id').in('match_id', ids),
  ]);
  const likeCounts = new Map<string, number>();
  const myLikes = new Set<string>();
  for (const l of (likeData as { match_id: string; player_id: string }[] | null) ?? []) {
    likeCounts.set(l.match_id, (likeCounts.get(l.match_id) ?? 0) + 1);
    if (l.player_id === myId) myLikes.add(l.match_id);
  }
  const commentCounts = new Map<string, number>();
  for (const c of (commentData as { match_id: string }[] | null) ?? []) {
    commentCounts.set(c.match_id, (commentCounts.get(c.match_id) ?? 0) + 1);
  }

  return rows.map((r) =>
    mapRow(r, { count: likeCounts.get(r.id) ?? 0, liked: myLikes.has(r.id) }, commentCounts.get(r.id) ?? 0),
  );
}

type FfttRow = {
  match_uid: string;
  match_date: string | null;
  victoire: boolean | null;
  adversaire_nom: string;
  adversaire_classement: string | null;
  player_number_id: string;
};

/**
 * Matchs OFFICIELS FFTT récents (table `fftt_matches`, lecture publique), rattachés à leur joueur
 * app via `players.fftt_id`. Cartes légères (V/D, pas de sets ni de social). On ne remonte que les
 * matchs de joueurs présents dans l'app.
 */
async function fetchFfttFeedMatches(limit: number): Promise<MatchFeedItem[]> {
  // 1. Joueurs app ayant lié une licence FFTT (on ne remonte QUE leurs matchs).
  type PRow = { id: string; display_name: string | null; avatar_url: string | null; fftt_id: string | null };
  const { data: pl } = await supabase
    .from('players')
    .select('id, display_name, avatar_url, fftt_id')
    .not('fftt_id', 'is', null);
  const players = ((pl as PRow[] | null) ?? []).filter((p) => p.fftt_id);
  if (!players.length) return [];
  const byFftt = new Map(players.map((p) => [p.fftt_id as string, p]));

  // 2. LEURS matchs officiels, les plus récents d'abord (filtre serveur sur les n° liés → pas de
  //    fenêtre gaspillée par des licenciés absents de l'app).
  const { data: fm } = await supabase
    .from('fftt_matches')
    .select('match_uid, match_date, victoire, adversaire_nom, adversaire_classement, player_number_id')
    .in('player_number_id', [...byFftt.keys()])
    .not('match_date', 'is', null)
    .order('match_date', { ascending: false })
    .limit(limit * 2);
  const rows = (fm as FfttRow[] | null) ?? [];

  const out: MatchFeedItem[] = [];
  for (const r of rows) {
    const p = byFftt.get(r.player_number_id);
    if (!p || !r.match_date) continue;
    out.push({
      id: r.match_uid,
      kind: 'fftt',
      playerA: { id: p.id, name: p.display_name ?? 'Joueur', avatarUrl: p.avatar_url },
      playerB: { id: '', name: r.adversaire_nom, avatarUrl: null },
      setScores: null,
      score: '',
      winnerIsA: r.victoire ?? true,
      ranked: true,
      date: r.match_date,
      format: 'FFTT',
      likeCount: 0,
      liked: false,
      commentCount: 0,
      opponentRank: r.adversaire_classement,
    });
  }
  return out;
}

/** Feed global unifié : matchs app confirmés + matchs officiels FFTT, les plus récents d'abord. */
export async function fetchMatchesFeed(myId: string | undefined, limit = 40): Promise<MatchFeedItem[]> {
  const [app, fftt] = await Promise.all([fetchAppMatchesFeed(myId, limit), fetchFfttFeedMatches(limit)]);
  return [...app, ...fftt].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, limit);
}

/** Un match du feed (pour l'écran détail). */
export async function fetchMatchFeedItem(matchId: string, myId: string | undefined): Promise<MatchFeedItem | null> {
  const { data } = await supabase.from('matches').select(SELECT).eq('id', matchId).maybeSingle();
  const r = data as unknown as Row | null;
  if (!r) return null;

  const [{ data: likeData }, { count: commentCount }] = await Promise.all([
    supabase.from('match_likes').select('player_id').eq('match_id', matchId),
    supabase.from('match_comments').select('id', { count: 'exact', head: true }).eq('match_id', matchId),
  ]);
  const likes = (likeData as { player_id: string }[] | null) ?? [];
  return mapRow(
    r,
    { count: likes.length, liked: !!myId && likes.some((l) => l.player_id === myId) },
    commentCount ?? 0,
  );
}

/**
 * Feed global des matchs (app + FFTT). `limit` grandit au scroll (feed infini) → il fait partie de
 * la clé ; `keepPreviousData` garde la liste affichée pendant qu'on charge la tranche suivante.
 */
export function useMatchesFeed(myId: string | undefined, limit = 40) {
  return useQuery({
    queryKey: [...qk.feed.matches(myId ?? 'anon'), limit],
    queryFn: () => fetchMatchesFeed(myId, limit),
    enabled: !!myId,
    staleTime: STALE.feed,
    placeholderData: keepPreviousData,
  });
}

/** Like/unlike optimiste d'un match du feed : met à jour le cache, rollback en cas d'échec. */
export function useToggleMatchLike(myId: string) {
  const qc = useQueryClient();
  const key = qk.feed.matches(myId); // préfixe → matche toutes les tailles [.., limit]
  return useMutation({
    mutationFn: async (item: MatchFeedItem) => {
      const liked = !item.liked;
      if (liked) await likeMatch(item.id, myId);
      else await unlikeMatch(item.id, myId);
      return liked;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueriesData<MatchFeedItem[]>({ queryKey: key });
      const liked = !item.liked;
      qc.setQueriesData<MatchFeedItem[]>({ queryKey: key }, (old) =>
        (old ?? []).map((m) => (m.id === item.id ? { ...m, liked, likeCount: m.likeCount + (liked ? 1 : -1) } : m)),
      );
      return { prev };
    },
    onError: (_e, _item, ctx) => {
      for (const [k, data] of ctx?.prev ?? []) qc.setQueryData(k, data);
    },
  });
}
