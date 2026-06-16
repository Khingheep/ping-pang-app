import { supabase } from '@/lib/supabase/client';

/** Enregistre le ressenti + note post-match du joueur courant. */
export async function saveMatchFeedback(
  matchId: string,
  playerId: string,
  feeling: string | null,
  note: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('match_feedback')
    .upsert({ match_id: matchId, player_id: playerId, feeling, note }, { onConflict: 'match_id,player_id' });
  if (error) throw error;
}
