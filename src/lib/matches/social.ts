/**
 * Social sur les matchs : likes + commentaires (même modèle que les séances).
 * Tables : match_likes (PK match_id+player_id) et match_comments.
 */

import { supabase } from '@/lib/supabase/client';

export type MatchLiker = { id: string; name: string; avatarUrl: string | null; elo: number; createdAt: string };

export type MatchComment = {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  body: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
};

export async function likeMatch(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('match_likes').insert({ match_id: matchId, player_id: playerId });
  if (error && error.code !== '23505') throw error; // 23505 = déjà liké → idempotent, pas une erreur
}

export async function unlikeMatch(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('match_likes').delete().eq('match_id', matchId).eq('player_id', playerId);
  if (error) throw error;
}

/** Joueurs ayant aimé un match (les plus récents d'abord). */
export async function fetchMatchLikers(matchId: string): Promise<MatchLiker[]> {
  const { data } = await supabase
    .from('match_likes')
    .select('created_at, players!match_likes_player_id_fkey(id, display_name, avatar_url, elo)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  type Row = { created_at: string; players: { id: string; display_name: string; avatar_url: string | null; elo: number | null } | null };
  return ((data as unknown as Row[] | null) ?? [])
    .filter((r) => r.players)
    .map((r) => ({
      id: r.players!.id,
      name: r.players!.display_name ?? 'Joueur',
      avatarUrl: r.players!.avatar_url ?? null,
      elo: r.players!.elo ?? 0,
      createdAt: r.created_at,
    }));
}

/** Commentaires d'un match (les plus anciens d'abord), avec aces (compteur + mon like via myId). */
export async function fetchMatchComments(matchId: string, myId?: string): Promise<MatchComment[]> {
  const { data } = await supabase
    .from('match_comments')
    .select('id, body, created_at, players!match_comments_player_id_fkey(id, display_name, avatar_url)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  type Row = {
    id: string;
    body: string;
    created_at: string;
    players: { id: string; display_name: string; avatar_url: string | null } | null;
  };
  const rows = (data as unknown as Row[] | null) ?? [];
  const ids = rows.map((r) => r.id);

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  if (ids.length) {
    const { data: likeData } = await supabase.from('match_comment_likes').select('comment_id, player_id').in('comment_id', ids);
    for (const l of (likeData as { comment_id: string; player_id: string }[] | null) ?? []) {
      counts.set(l.comment_id, (counts.get(l.comment_id) ?? 0) + 1);
      if (myId && l.player_id === myId) mine.add(l.comment_id);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    author: { id: r.players?.id ?? '', name: r.players?.display_name ?? 'Joueur', avatarUrl: r.players?.avatar_url ?? null },
    body: r.body,
    createdAt: r.created_at,
    likeCount: counts.get(r.id) ?? 0,
    liked: mine.has(r.id),
  }));
}

export async function addMatchComment(matchId: string, playerId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('match_comments')
    .insert({ match_id: matchId, player_id: playerId, body: body.trim() });
  if (error) throw error;
}

/** Ace (like) / retrait d'ace sur un commentaire de match. Idempotent à l'insert (23505). */
export async function likeMatchComment(commentId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('match_comment_likes').insert({ comment_id: commentId, player_id: playerId });
  if (error && error.code !== '23505') throw error;
}

export async function unlikeMatchComment(commentId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('match_comment_likes').delete().eq('comment_id', commentId).eq('player_id', playerId);
  if (error) throw error;
}
