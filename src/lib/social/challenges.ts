import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type ChallengeFormat = 'bo7' | 'bo5' | 'bo3';

export type Challenge = {
  id: string;
  from_player: string;
  to_player: string;
  message: string | null;
  status: string;
  format: string | null;
  created_at: string;
  from: { display_name: string; avatar_url: string | null } | null;
  to: { display_name: string; avatar_url: string | null } | null;
};

/** Nombre de sets (best_of) associé à un format de défi. */
export function bestOfForFormat(format: ChallengeFormat): number {
  if (format === 'bo3') return 3;
  if (format === 'bo5') return 5;
  return 7; // bo7
}

export type RecentOpponent = { id: string; name: string; elo: number; city: string | null; lastPlayed: string };

const CHALLENGE_COLS =
  'id, from_player, to_player, message, status, format, created_at, from:from_player(display_name, avatar_url), to:to_player(display_name, avatar_url)';

export async function fetchIncomingChallenges(myId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLS)
    .eq('to_player', myId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  return (data as unknown as Challenge[] | null) ?? [];
}

/** Défis que J'AI envoyés (tous statuts), pour la section « Défis en cours ». */
export async function fetchOutgoingChallenges(myId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLS)
    .eq('from_player', myId)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data as unknown as Challenge[] | null) ?? [];
}

export async function sendChallenge(
  fromId: string,
  toId: string,
  format: ChallengeFormat = 'bo5',
  message?: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('challenges')
    .insert({ from_player: fromId, to_player: toId, format, message: message ?? null, status: 'sent' })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function respondChallenge(id: string, status: 'accepted' | 'declined'): Promise<void> {
  const { error } = await supabase.from('challenges').update({ status }).eq('id', id);
  if (error) throw error;
}

/** Un défi accepté, prêt à jouer — vu du point de vue de l'utilisateur (adversaire résolu). */
export type ActiveChallenge = Challenge & { opponentId: string; opponentName: string; opponentAvatar: string | null };

/**
 * Défis ACCEPTÉS qui me concernent (que je les aie envoyés OU reçus) → section « À jouer ».
 * C'est ce qui manquait : après acceptation, un défi n'apparaissait plus côté receveur.
 */
export async function fetchActiveChallenges(myId: string): Promise<ActiveChallenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLS)
    .eq('status', 'accepted')
    .or(`from_player.eq.${myId},to_player.eq.${myId}`)
    .order('created_at', { ascending: false });
  return ((data as unknown as Challenge[] | null) ?? []).map((c) => {
    const iAmFrom = c.from_player === myId;
    const opp = iAmFrom ? c.to : c.from;
    return {
      ...c,
      opponentId: iAmFrom ? c.to_player : c.from_player,
      opponentName: opp?.display_name ?? 'Joueur',
      opponentAvatar: opp?.avatar_url ?? null,
    };
  });
}

/** Clôture un défi accepté (statut → `played`, lié au match) — appelable par les 2 joueurs (RPC). */
export async function closeChallenge(challengeId: string, matchId?: string | null): Promise<void> {
  const { error } = await supabase.rpc('close_challenge', { p_challenge: challengeId, p_match: matchId ?? null });
  if (error) throw error;
}

/** Annule un défi que J'AI envoyé (RLS : seulement l'expéditeur, tant qu'il est « sent »). */
export async function cancelChallenge(id: string): Promise<void> {
  const { error } = await supabase.from('challenges').delete().eq('id', id);
  if (error) throw error;
}

type MatchRow = {
  player_a: string;
  player_b: string;
  played_at: string;
  a: { display_name: string; elo: number; city: string | null } | null;
  b: { display_name: string; elo: number; city: string | null } | null;
};

/** Adversaires récents (depuis mes matchs confirmés), dédupliqués, plus récent d'abord. */
export async function fetchRecentOpponents(myId: string, limit = 6): Promise<RecentOpponent[]> {
  const { data } = await supabase
    .from('matches')
    .select('player_a, player_b, played_at, a:player_a(display_name, elo, city), b:player_b(display_name, elo, city)')
    .eq('status', 'confirmed')
    .order('played_at', { ascending: false })
    .limit(40);
  const rows = (data as unknown as MatchRow[] | null) ?? [];
  const seen = new Set<string>();
  const out: RecentOpponent[] = [];
  for (const r of rows) {
    const iAmA = r.player_a === myId;
    const oppId = iAmA ? r.player_b : r.player_a;
    const opp = iAmA ? r.b : r.a;
    if (!oppId || oppId === myId || seen.has(oppId)) continue;
    seen.add(oppId);
    out.push({ id: oppId, name: opp?.display_name ?? 'Joueur', elo: opp?.elo ?? 0, city: opp?.city ?? null, lastPlayed: r.played_at });
    if (out.length >= limit) break;
  }
  return out;
}

/** ELO en jeu (Glicko) contre un adversaire : gain si victoire / perte si défaite. */
export async function challengePreview(opponentId: string): Promise<{ winDelta: number; lossDelta: number }> {
  const { data } = await supabase.rpc('glicko_preview', { p_opponent: opponentId });
  const row = (data as { win_delta: number; loss_delta: number }[] | null)?.[0];
  return { winDelta: row?.win_delta ?? 0, lossDelta: row?.loss_delta ?? 0 };
}

export const FORMAT_INFO: Record<ChallengeFormat, { title: string; tag: string; detail: string }> = {
  bo5: { title: 'BO5', tag: 'Classique', detail: 'Meilleur des 5 sets' },
  bo3: { title: 'BO3', tag: 'Rapide', detail: 'Meilleur des 3 sets' },
  bo7: { title: 'BO7', tag: 'Marathon', detail: 'Meilleur des 7 sets' },
};

/** Défis reçus (mis en cache). */
export function useIncomingChallenges(myId: string | undefined) {
  return useQuery({
    queryKey: qk.challenges.incoming(myId ?? 'anon'),
    queryFn: () => fetchIncomingChallenges(myId!),
    enabled: !!myId,
    staleTime: STALE.challenges,
  });
}

/** Défis que j'ai envoyés (mis en cache). */
export function useOutgoingChallenges(myId: string | undefined) {
  return useQuery({
    queryKey: qk.challenges.outgoing(myId ?? 'anon'),
    queryFn: () => fetchOutgoingChallenges(myId!),
    enabled: !!myId,
    staleTime: STALE.challenges,
  });
}

/** Défis acceptés, à jouer (mis en cache). */
export function useActiveChallenges(myId: string | undefined) {
  return useQuery({
    queryKey: qk.challenges.active(myId ?? 'anon'),
    queryFn: () => fetchActiveChallenges(myId!),
    enabled: !!myId,
    staleTime: STALE.challenges,
  });
}

// Compteur process-wide pour des noms de canaux realtime uniques (cf. messages.ts).
let channelSeq = 0;

/**
 * Abonnement realtime aux défis qui me concernent (reçus OU envoyés), tous événements.
 * Deux filtres car postgres_changes n'en accepte qu'un par écouteur. `onChange` est appelé
 * à chaque insert/update/delete → l'appelant rafraîchit ses listes (incoming + outgoing).
 */
export function subscribeChallenges(myId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`challenges-${myId}-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `to_player=eq.${myId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `from_player=eq.${myId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
