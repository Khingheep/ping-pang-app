import { supabase } from '@/lib/supabase/client';

export type Venue = {
  id: string;
  name: string;
  address: string | null;
  indoor: boolean | null;
  lat: number | null;
  lng: number | null;
};

export type EventPP = {
  id: string;
  title: string;
  starts_at: string | null;
  spots_left: number | null;
  venue: { name: string } | null;
};

export async function fetchVenues(): Promise<Venue[]> {
  // 'manuel' avant 'openstreetmap' → les lieux curatés (dont le club) en tête de liste.
  const { data } = await supabase
    .from('venues')
    .select('id, name, address, indoor, lat, lng')
    .order('source', { ascending: true })
    .order('name', { ascending: true });
  return (data as Venue[] | null) ?? [];
}

/** Lieux curatés uniquement (le club + spots ajoutés à la main), pas le dump OpenStreetMap. */
export async function fetchFeaturedVenues(): Promise<Venue[]> {
  const { data } = await supabase
    .from('venues')
    .select('id, name, address, indoor, lat, lng')
    .neq('source', 'openstreetmap')
    .order('name', { ascending: true });
  return (data as Venue[] | null) ?? [];
}

export async function fetchVenue(id: string): Promise<Venue | null> {
  const { data } = await supabase
    .from('venues')
    .select('id, name, address, indoor, lat, lng')
    .eq('id', id)
    .maybeSingle();
  return (data as Venue | null) ?? null;
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
