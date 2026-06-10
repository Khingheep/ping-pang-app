import { supabase } from '@/lib/supabase/client';

export type Venue = {
  id: string;
  name: string;
  address: string | null;
  indoor: boolean | null;
};

export type EventPP = {
  id: string;
  title: string;
  starts_at: string | null;
  spots_left: number | null;
  venue: { name: string } | null;
};

export async function fetchVenues(): Promise<Venue[]> {
  const { data } = await supabase.from('venues').select('id, name, address, indoor').order('name');
  return (data as Venue[] | null) ?? [];
}

export async function fetchEvents(): Promise<EventPP[]> {
  const { data } = await supabase
    .from('events_ppp')
    .select('id, title, starts_at, spots_left, venues(name)')
    .order('starts_at', { ascending: true });
  return ((data as unknown as { id: string; title: string; starts_at: string | null; spots_left: number | null; venues: { name: string } | null }[] | null) ?? []).map(
    (e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, spots_left: e.spots_left, venue: e.venues ?? null }),
  );
}
