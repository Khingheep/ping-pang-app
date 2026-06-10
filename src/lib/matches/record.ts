import { supabase } from '@/lib/supabase/client';

export type MatchResult = {
  won: boolean;
  delta_me: number;
  delta_opp: number;
  match_id: string;
};

/** Enregistre un match + met à jour l'ELO des 2 joueurs (RPC SECURITY DEFINER). */
export async function recordMatch(p: {
  opponentId: string;
  mySets: number;
  oppSets: number;
  bestOf?: number;
  feeling?: string | null;
  isRanked?: boolean;
}): Promise<MatchResult> {
  const { data, error } = await supabase.rpc('record_match', {
    p_opponent: p.opponentId,
    p_my_sets: p.mySets,
    p_opp_sets: p.oppSets,
    p_best_of: p.bestOf ?? 5,
    p_is_ranked: p.isRanked ?? true,
    p_feeling: p.feeling ?? null,
  });
  if (error) throw error;
  return data as MatchResult;
}
