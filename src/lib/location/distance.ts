export type LatLng = { lat: number; lng: number };

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau en km entre deux points (formule de haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371; // rayon terrestre moyen (km)
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** « 850 m », « 2,4 km », « 12 km ». */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Distance lisible entre l'utilisateur et un point, ou null si l'un des deux manque. */
export function distanceLabel(from: LatLng | null, to: { lat: number | null; lng: number | null }): string | null {
  if (!from || to.lat == null || to.lng == null) return null;
  return formatDistance(distanceKm(from, { lat: to.lat, lng: to.lng }));
}
