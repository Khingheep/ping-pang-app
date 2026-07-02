/**
 * Construction du feed « Parties » (liste-first, façon TheFork) - logique PURE (testée, sans RN).
 *
 * On part des créneaux ouverts (déjà chargés pour la carte) et on les regroupe PAR LIEU : un lieu =
 * une carte, ses créneaux = des pastilles réservables inline. La curation est implicite : seuls les
 * lieux qui ont au moins un créneau ouvert apparaissent ici (pas le dump des 267 tables OSM).
 *
 * Tri : par distance si on connaît la position de l'utilisateur, sinon par créneau le plus proche
 * dans le temps → en haut, ce qui est jouable le plus tôt / le plus près.
 */

import { distanceKm, type LatLng } from '../location/distance';
import type { Slot } from '../slots/slots';

export type VenueFeedEntry = {
  id: string;
  name: string;
  address: string | null;
  indoor: boolean | null;
  lat: number | null;
  lng: number | null;
  /** Distance à l'utilisateur (km), ou null si position/coords manquantes. */
  distanceKm: number | null;
  /** Créneaux du lieu, triés du plus proche au plus lointain dans le temps. */
  slots: Slot[];
  /** ISO du prochain créneau (clé de tri quand on n'a pas la position). */
  nextStartsAt: string;
  /** Nombre total de joueurs inscrits sur les créneaux du lieu (signal social). */
  players: number;
};

/** Regroupe les créneaux par lieu et trie les lieux (distance, sinon imminence). */
export function buildVenueFeed(slots: Slot[], coords: LatLng | null): VenueFeedEntry[] {
  const byVenue = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = byVenue.get(s.venueId);
    if (arr) arr.push(s);
    else byVenue.set(s.venueId, [s]);
  }

  const entries: VenueFeedEntry[] = [];
  for (const [id, list] of byVenue) {
    const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const head = sorted[0];
    const d =
      coords && head.venueLat != null && head.venueLng != null
        ? distanceKm(coords, { lat: head.venueLat, lng: head.venueLng })
        : null;
    entries.push({
      id,
      name: head.venueName,
      address: head.venueAddress,
      indoor: head.venueIndoor,
      lat: head.venueLat,
      lng: head.venueLng,
      distanceKm: d,
      slots: sorted,
      nextStartsAt: head.startsAt,
      players: sorted.reduce((n, s) => n + s.participants.length, 0),
    });
  }

  return entries.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1; // ceux avec distance connue d'abord
    if (b.distanceKm != null) return 1;
    return a.nextStartsAt.localeCompare(b.nextStartsAt);
  });
}

/** Filtre intérieur/extérieur appliqué aux créneaux AVANT regroupement (selon `venueIndoor`). */
export type PlaceFilter = 'all' | 'indoor' | 'outdoor';

export function filterSlotsByPlace(slots: Slot[], place: PlaceFilter): Slot[] {
  if (place === 'all') return slots;
  const wantIndoor = place === 'indoor';
  return slots.filter((s) => !!s.venueIndoor === wantIndoor);
}

/** Un lieu curaté à découvrir (sans créneau ouvert pour l'instant) → invite à proposer. */
export type DiscoverEntry = {
  id: string;
  name: string;
  address: string | null;
  indoor: boolean | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
};

type FeaturedVenue = { id: string; name: string; address: string | null; indoor: boolean | null; lat: number | null; lng: number | null };

/**
 * Lieux curatés (clubs ajoutés à la main, hors OSM) à proposer en « Autour de toi », en excluant
 * ceux qui ont déjà un créneau (déjà dans le feed) et en triant par distance. Coupé à `limit`.
 */
export function buildDiscover(
  featured: FeaturedVenue[],
  coords: LatLng | null,
  excludeIds: Set<string>,
  limit = 8,
): DiscoverEntry[] {
  return featured
    .filter((v) => !excludeIds.has(v.id))
    .map((v) => ({
      ...v,
      distanceKm: coords && v.lat != null && v.lng != null ? distanceKm(coords, { lat: v.lat, lng: v.lng }) : null,
    }))
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
    .slice(0, limit);
}
