/**
 * Social sur les matchs : likes + commentaires (même modèle que les séances).
 * Tables : match_likes (PK match_id+player_id) et match_comments.
 */

import { supabase } from '@/lib/supabase/client';

export type MatchLiker = { id: string; name: string; avatarUrl: string | null; createdAt: string };

export type MatchComment = {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  body: string;
  createdAt: string;
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
    .select('created_at, players!match_likes_player_id_fkey(id, display_name, avatar_url)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });
  type Row = { created_at: string; players: { id: string; display_name: string; avatar_url: string | null } | null };
  return ((data as unknown as Row[] | null) ?? [])
    .filter((r) => r.players)
    .map((r) => ({
      id: r.players!.id,
      name: r.players!.display_name ?? 'Joueur',
      avatarUrl: r.players!.avatar_url ?? null,
      createdAt: r.created_at,
    }));
}

/** Commentaires d'un match (les plus anciens d'abord, ordre de lecture). */
export async function fetchMatchComments(matchId: string): Promise<MatchComment[]> {
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
  return ((data as unknown as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    author: { id: r.players?.id ?? '', name: r.players?.display_name ?? 'Joueur', avatarUrl: r.players?.avatar_url ?? null },
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addMatchComment(matchId: string, playerId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('match_comments')
    .insert({ match_id: matchId, player_id: playerId, body: body.trim() });
  if (error) throw error;
}
