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

/** Distance à vol d'oiseau entre deux points GPS, en kilomètres (formule de haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; // rayon terrestre moyen en km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Lieu le plus proche d'une position GPS parmi ceux qui ont des coordonnées. */
export function nearestVenue(
  lat: number,
  lng: number,
  venues: Venue[],
): { venue: Venue; distanceKm: number } | null {
  let best: { venue: Venue; distanceKm: number } | null = null;
  for (const v of venues) {
    if (v.lat == null || v.lng == null) continue;
    const d = distanceKm(lat, lng, v.lat, v.lng);
    if (!best || d < best.distanceKm) best = { venue: v, distanceKm: d };
  }
  return best;
}

/** Minuscule sans accents/diacritiques, pour une recherche tolérante (« ile » trouve « Île »). */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Enregistre un lieu saisi à la main, introuvable dans la base, pour relecture côté dev.
 * Best-effort : n'interrompt jamais l'enregistrement de la séance si l'insert échoue.
 */
export async function suggestVenue(
  playerId: string,
  label: string,
  coords?: { lat: number; lng: number } | null,
): Promise<void> {
  try {
    await supabase.from('venue_suggestions').insert({
      player_id: playerId,
      label: label.trim(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
  } catch {
    /* proposition de lieu optionnelle : on ignore l'échec */
  }
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
