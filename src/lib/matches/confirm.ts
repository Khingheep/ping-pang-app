import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type ProposeResult = { match_id: string; status: 'pending'; won: boolean; preview_delta: number };
export type ConfirmResult = { match_id: string; status: 'confirmed' | 'pending' | 'disputed'; won: boolean; delta_me: number };

/** Propose un match : crée un match `pending`, confirmé côté proposeur. L'ELO s'applique à la confirmation de l'adversaire. */
export async function proposeMatch(p: {
  opponentId: string;
  mySets: number;
  oppSets: number;
  bestOf?: number;
  feeling?: string | null;
  isRanked?: boolean;
  setScores?: string | null;
}): Promise<ProposeResult> {
  const { data, error } = await supabase.rpc('propose_match', {
    p_opponent: p.opponentId,
    p_my_sets: p.mySets,
    p_opp_sets: p.oppSets,
    p_best_of: p.bestOf ?? 5,
    p_is_ranked: p.isRanked ?? true,
    p_feeling: p.feeling ?? null,
    p_set_scores: p.setScores ?? null,
  });
  if (error) throw error;
  return data as ProposeResult;
}

export type PendingMatch = {
  id: string;
  proposerName: string;
  proposerAvatar: string | null;
  myScore: string; // vu de mon côté (je suis player_b)
  bestOf: number;
  isRanked: boolean;
  feeling: string | null;
  createdAt: string;
};

type PendingRow = {
  id: string;
  score: string | null;
  best_of: number | null;
  is_ranked: boolean;
  feeling: string | null;
  created_at: string;
  a: { display_name: string; avatar_url: string | null } | null;
};

/** Matchs en attente de MA confirmation (je suis l'adversaire = player_b). */
export async function fetchPendingToConfirm(userId: string): Promise<PendingMatch[]> {
  const { data } = await supabase
    .from('matches')
    .select('id, score, best_of, is_ranked, feeling, created_at, a:player_a(display_name, avatar_url)')
    .eq('status', 'pending')
    .eq('player_b', userId)
    .eq('confirmed_by_b', false)
    .order('created_at', { ascending: false });

  return ((data as unknown as PendingRow[] | null) ?? []).map((r) => {
    // score stocké du point de vue du proposeur (player_a) → on inverse pour player_b
    const [x, y] = (r.score ?? '0-0').split('-');
    return {
      id: r.id,
      proposerName: r.a?.display_name ?? 'Joueur',
      proposerAvatar: r.a?.avatar_url ?? null,
      myScore: `${y}-${x}`,
      bestOf: r.best_of ?? 5,
      isRanked: r.is_ranked,
      feeling: r.feeling,
      createdAt: r.created_at,
    };
  });
}

export async function confirmMatch(matchId: string): Promise<ConfirmResult> {
  const { data, error } = await supabase.rpc('confirm_match', { p_match: matchId });
  if (error) throw error;
  return data as ConfirmResult;
}

export async function disputeMatch(matchId: string): Promise<{ match_id: string; status: 'disputed' }> {
  const { data, error } = await supabase.rpc('dispute_match', { p_match: matchId });
  if (error) throw error;
  return data as { match_id: string; status: 'disputed' };
}

/** Re-propose le bon score d'un match CONTESTÉ : réutilise l'enregistrement (le remet `pending`, corrigé). */
export async function reproposeMatch(p: {
  matchId: string;
  mySets: number;
  oppSets: number;
  setScores?: string | null;
}): Promise<{ match_id: string; status: 'pending' }> {
  const { data, error } = await supabase.rpc('repropose_match', {
    p_match: p.matchId,
    p_my_sets: p.mySets,
    p_opp_sets: p.oppSets,
    p_set_scores: p.setScores ?? null,
  });
  if (error) throw error;
  return data as { match_id: string; status: 'pending' };
}

/** Matchs en attente de ma confirmation (mis en cache). */
export function usePendingToConfirm(myId: string | undefined) {
  return useQuery({
    queryKey: qk.pending(myId ?? 'anon'),
    queryFn: () => fetchPendingToConfirm(myId!),
    enabled: !!myId,
    staleTime: STALE.pending,
  });
}

export type DisputedMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  opponentAvatar: string | null;
  myScore: string; // score proposé, vu de MON côté
  bestOf: number;
  createdAt: string;
};

type DisputedRow = {
  id: string;
  player_a: string;
  player_b: string;
  score: string | null;
  best_of: number | null;
  created_at: string;
  a: { display_name: string; avatar_url: string | null } | null;
  b: { display_name: string; avatar_url: string | null } | null;
};

/** Mes matchs CONTESTÉS (status='disputed') — à résoudre en re-proposant le bon score. */
export async function fetchDisputedToResolve(userId: string): Promise<DisputedMatch[]> {
  const { data } = await supabase
    .from('matches')
    .select('id, player_a, player_b, score, best_of, created_at, a:player_a(display_name, avatar_url), b:player_b(display_name, avatar_url)')
    .eq('status', 'disputed')
    .or(`player_a.eq.${userId},player_b.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(10);

  return ((data as unknown as DisputedRow[] | null) ?? []).map((r) => {
    const iAmA = r.player_a === userId;
    const opp = iAmA ? r.b : r.a;
    // score stocké du point de vue de player_a → on inverse si je suis player_b.
    const [x, y] = (r.score ?? '0-0').split('-');
    return {
      id: r.id,
      opponentId: iAmA ? r.player_b : r.player_a,
      opponentName: opp?.display_name ?? 'Joueur',
      opponentAvatar: opp?.avatar_url ?? null,
      myScore: iAmA ? `${x}-${y}` : `${y}-${x}`,
      bestOf: r.best_of ?? 5,
      createdAt: r.created_at,
    };
  });
}

/** Mes matchs contestés (mis en cache). Clé préfixée par `pending` → invalidée avec elle. */
export function useDisputedToResolve(myId: string | undefined) {
  return useQuery({
    queryKey: [...qk.pending(myId ?? 'anon'), 'disputed'],
    queryFn: () => fetchDisputedToResolve(myId!),
    enabled: !!myId,
    staleTime: STALE.pending,
  });
}

/** Confirme un match (RPC) + invalide les caches impactés (pending, feed, profil, classement). */
export function useConfirmMatch(myId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => confirmMatch(matchId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.pending(myId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: qk.profile(myId) });
      void qc.invalidateQueries({ queryKey: qk.matches.recent(myId) });
      void qc.invalidateQueries({ queryKey: qk.leaderboard() });
    },
  });
}

/** Conteste un match (RPC) + retire de la liste « à confirmer ». */
export function useDisputeMatch(myId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => disputeMatch(matchId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.pending(myId) });
    },
  });
}
