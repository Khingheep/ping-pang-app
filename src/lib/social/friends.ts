import { supabase } from '@/lib/supabase/client';

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends';

type Row = { requester: string; addressee: string; status: 'pending' | 'accepted' };

/** Statut d'amitié entre moi et un autre joueur. */
export async function getFriendStatus(myId: string, otherId: string): Promise<FriendStatus> {
  const { data } = await supabase
    .from('friendships')
    .select('requester, addressee, status')
    .or(`and(requester.eq.${myId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${myId})`)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester === myId ? 'pending_out' : 'pending_in';
}

/** Envoie une demande d'ami (je suis le requester). */
export async function sendFriendRequest(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('friendships').insert({ requester: myId, addressee: otherId, status: 'pending' });
  if (error) throw error;
}

/** Accepte la demande reçue de `otherId` (je suis l'addressee). */
export async function acceptFriendRequest(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester', otherId)
    .eq('addressee', myId)
    .eq('status', 'pending');
  if (error) throw error;
}

/** Supprime le lien (annule une demande, refuse, ou retire un ami) dans les 2 sens. */
export async function removeFriend(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(requester.eq.${myId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${myId})`);
  if (error) throw error;
}

/** IDs de mes amis acceptés (les 2 sens). */
export async function fetchFriendIds(myId: string): Promise<string[]> {
  const { data } = await supabase
    .from('friendships')
    .select('requester, addressee')
    .eq('status', 'accepted')
    .or(`requester.eq.${myId},addressee.eq.${myId}`);
  return ((data as { requester: string; addressee: string }[] | null) ?? []).map((r) =>
    r.requester === myId ? r.addressee : r.requester,
  );
}
