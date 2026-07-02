import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type NotifData = {
  match_id?: string;
  player_id?: string;
  session_id?: string;
  venue_id?: string;
  slot_id?: string;
  name?: string;
};

export type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  data: NotifData;
};

// Les notifs de type `message` sont livrées en push + affichées dans l'écran Messages :
// on les exclut de la cloche pour ne pas doublonner.
const BELL_EXCLUDE = ['message'];

/**
 * Écran cible au tap d'une notification (liste in-app ET tap sur le push système).
 * Retourne null si la notif ne porte pas l'entité nécessaire (anciennes notifs sans `data`).
 */
export function notifRoute(
  type: string,
  data: NotifData | undefined,
): { pathname: string; params: Record<string, string> } | null {
  const d = data ?? {};
  switch (type) {
    case 'challenge':
    case 'friend_request':
    case 'friend_accepted':
      return d.player_id ? { pathname: '/player', params: { id: d.player_id } } : null;
    case 'match_confirm':
    case 'match_confirmed':
    case 'match_disputed':
    case 'match_comment':
    case 'match_like':
      return d.match_id ? { pathname: '/match', params: { id: d.match_id } } : null;
    case 'slot':
    case 'slot_join':
      return d.venue_id ? { pathname: '/venue', params: { id: d.venue_id } } : null;
    case 'session_like':
    case 'session_comment':
      return d.session_id ? { pathname: '/session', params: { id: d.session_id } } : null;
    case 'message':
      return d.player_id ? { pathname: '/chat', params: { id: d.player_id, name: d.name ?? '' } } : null;
    default:
      return null;
  }
}

export async function fetchNotifications(): Promise<Notif[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, created_at, data')
    .not('type', 'in', `(${BELL_EXCLUDE.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(50);
  return ((data as Notif[] | null) ?? []).map((n) => ({ ...n, data: n.data ?? {} }));
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false)
    .not('type', 'in', `(${BELL_EXCLUDE.join(',')})`);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllRead(): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('read', false);
}

/** Nombre de notifs non lues (pour la cloche), mis en cache. */
export function useUnreadCount() {
  return useQuery({
    queryKey: qk.notifications.unread(),
    queryFn: () => unreadCount(),
    staleTime: STALE.notifications,
  });
}
