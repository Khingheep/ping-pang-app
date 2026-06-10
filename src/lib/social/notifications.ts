import { supabase } from '@/lib/supabase/client';

export type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

export async function fetchNotifications(): Promise<Notif[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as Notif[] | null) ?? [];
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  return count ?? 0;
}

export async function markAllRead(): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('read', false);
}
