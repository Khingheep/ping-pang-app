import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
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

/** Joueur sélectionnable comme partenaire (profil minimal). */
export type PartnerCandidate = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isFriend: boolean;
};

/**
 * Candidats partenaires : tous les joueurs Ping Pang Paris (hors soi-même),
 * avec mes amis remontés en tête de liste.
 */
export async function fetchPartnerCandidates(myId: string, limit = 200): Promise<PartnerCandidate[]> {
  const [friendIds, players] = await Promise.all([
    fetchFriendIds(myId),
    supabase
      .from('players')
      .select('id, display_name, avatar_url')
      .neq('id', myId)
      .order('display_name', { ascending: true })
      .limit(limit),
  ]);
  const friendSet = new Set(friendIds);
  const rows = (players.data as { id: string; display_name: string | null; avatar_url: string | null }[] | null) ?? [];
  return rows
    .map((r) => ({
      id: r.id,
      name: r.display_name ?? 'Joueur',
      avatarUrl: r.avatar_url,
      isFriend: friendSet.has(r.id),
    }))
    .sort((a, b) => {
      // Amis d'abord, puis tri alphabétique.
      if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** IDs de mes amis (mis en cache) - sert au filtre « Amis » du classement. */
export function useFriendIds(myId: string | undefined) {
  return useQuery({
    queryKey: qk.friends.ids(myId ?? 'anon'),
    queryFn: () => fetchFriendIds(myId!),
    enabled: !!myId,
    staleTime: STALE.players,
  });
}

/** Statut d'amitié avec un autre joueur (mis en cache). */
export function useFriendStatus(myId: string | undefined, otherId: string | undefined) {
  return useQuery({
    queryKey: qk.friends.status(myId ?? 'anon', otherId ?? 'anon'),
    queryFn: () => getFriendStatus(myId!, otherId!),
    enabled: !!myId && !!otherId,
    staleTime: STALE.players,
  });
}
