import { supabase } from '@/lib/supabase/client';

export type Challenge = {
  id: string;
  from_player: string;
  to_player: string;
  message: string | null;
  status: string;
  created_at: string;
  from: { display_name: string } | null;
};

export async function fetchIncomingChallenges(myId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select('id, from_player, to_player, message, status, created_at, from:from_player(display_name)')
    .eq('to_player', myId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  return (data as unknown as Challenge[] | null) ?? [];
}

export async function sendChallenge(fromId: string, toId: string, message?: string): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .insert({ from_player: fromId, to_player: toId, message: message ?? null, status: 'sent' });
  if (error) throw error;
}

export async function respondChallenge(id: string, status: 'accepted' | 'declined'): Promise<void> {
  const { error } = await supabase.from('challenges').update({ status }).eq('id', id);
  if (error) throw error;
}
