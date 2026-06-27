import { supabase } from '@/lib/supabase/client';

export type FeedEventType = 'match' | 'newcomer' | 'tournament' | 'slot';

export type FeedEvent = {
  id: string;
  type: FeedEventType;
  actorName: string | null;
  targetName: string | null;
  title: string;
  body: string | null;
  eloDelta: number | null;
  createdAt: string;
};

type Row = {
  id: string;
  type: string;
  actor_name: string | null;
  target_name: string | null;
  title: string;
  body: string | null;
  elo_delta: number | null;
  created_at: string;
};

/** Activité du club — feed global (world-readable). */
export async function fetchFeed(limit = 30): Promise<FeedEvent[]> {
  const { data } = await supabase
    .from('feed_events')
    .select('id, type, actor_name, target_name, title, body, elo_delta, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    type: (r.type as FeedEventType) ?? 'match',
    actorName: r.actor_name,
    targetName: r.target_name,
    title: r.title,
    body: r.body,
    eloDelta: r.elo_delta,
    createdAt: r.created_at,
  }));
}
