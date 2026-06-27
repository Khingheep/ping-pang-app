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
  a: { display_name: string } | null;
};

/** Matchs en attente de MA confirmation (je suis l'adversaire = player_b). */
export async function fetchPendingToConfirm(userId: string): Promise<PendingMatch[]> {
  const { data } = await supabase
    .from('matches')
    .select('id, score, best_of, is_ranked, feeling, created_at, a:player_a(display_name)')
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
