import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type Venue = {
  id: string;
  name: string;
  address: string | null;
  indoor: boolean | null;
  lat: number | null;
  lng: number | null;
  source?: string | null; // 'openstreetmap' = table publique ext. ; autre = club curaté/FFTT
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

/**
 * Tables/lieux dont les coordonnées tombent dans le cadre visible de la carte (viewport).
 * Appelé à chaque déplacement de la carte → on ne charge que ce qui est à l'écran.
 */
export async function fetchVenuesInBbox(
  b: { n: number; s: number; e: number; w: number },
  limit = 250,
): Promise<Venue[]> {
  const { data } = await supabase
    .from('venues')
    .select('id, name, address, indoor, lat, lng, source')
    .gte('lat', b.s)
    .lte('lat', b.n)
    .gte('lng', b.w)
    .lte('lng', b.e)
    .limit(limit);
  return (data as Venue[] | null) ?? [];
}

/**
 * Recherche de lieux par nom, pour choisir son club. Sans recherche : on propose en priorité
 * les lieux curatés (clubs ajoutés à la main), pas le dump OpenStreetMap.
 */
export async function searchVenues(query: string, limit = 20): Promise<Venue[]> {
  const q = query.trim();
  let req = supabase.from('venues').select('id, name, address, indoor, lat, lng');
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    req = req.ilike('name', pattern);
  } else {
    req = req.neq('source', 'openstreetmap');
  }
  const { data } = await req.order('name', { ascending: true }).limit(limit);
  return (data as Venue[] | null) ?? [];
}

/**
 * Tente de retrouver un venue à partir d'un nom de club FFTT (les clubs FFTT sont ingérés dans
 * `venues` avec `source='fftt'`). Préfiltre serveur sur le token le plus long, puis comparaison
 * normalisée (sans accents/espaces/ponctuation) : exact d'abord, sinon inclusion forte.
 * Renvoie null si rien de fiable → l'utilisateur choisira à la main.
 */
export async function matchVenueByName(clubName: string | null): Promise<Venue | null> {
  const norm = (s: string) => foldText(s).replace(/[^a-z0-9]/g, '');
  const target = norm(clubName ?? '');
  if (target.length < 4) return null;
  // Préfiltre serveur : le plus long token (≥3) du nom de club, pour ne pas charger tout le catalogue.
  const longest = foldText(clubName ?? '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  if (!longest) return null;
  const pattern = `%${longest.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from('venues')
    .select('id, name, address, indoor, lat, lng')
    .ilike('name', pattern)
    .limit(60);
  const rows = (data as Venue[] | null) ?? [];
  return (
    rows.find((v) => norm(v.name) === target) ??
    rows.find((v) => {
      const n = norm(v.name);
      return n.length >= 5 && (n.includes(target) || target.includes(n));
    }) ??
    null
  );
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

/**
 * Lieux curatés (clubs ajoutés à la main, hors dump OSM), mis en cache. Sert la section
 * « Autour de toi » du feed Parties : des lieux à découvrir où proposer un créneau.
 */
export function useFeaturedVenues() {
  return useQuery({
    queryKey: qk.venues.featured(),
    queryFn: fetchFeaturedVenues,
    staleTime: STALE.venues,
  });
}

/**
 * Lieux du cadre visible (bbox), mis en cache par zone. `keepPreviousData` garde les marqueurs
 * précédents affichés pendant le chargement de la nouvelle zone → pas de flash au drag de carte.
 * La clé arrondit les coordonnées (4 décimales) pour ne pas générer une requête par micro-déplacement.
 */
export function useVenuesInBbox(
  bbox: { n: number; s: number; e: number; w: number } | null,
  limit = 250,
) {
  return useQuery({
    queryKey: qk.venues.bbox(
      bbox ? `${bbox.s.toFixed(4)},${bbox.w.toFixed(4)},${bbox.n.toFixed(4)},${bbox.e.toFixed(4)}` : 'none',
    ),
    queryFn: () => fetchVenuesInBbox(bbox!, limit),
    enabled: !!bbox,
    staleTime: STALE.venues,
    placeholderData: keepPreviousData,
  });
}
