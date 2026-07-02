/**
 * Vignette carte statique (la « photo » d'un lieu) composée de tuiles raster CARTO Voyager -
 * gratuites, sans clé (mêmes tuiles que la WebView Leaflet). Pas de service de static-map fiable
 * sans clé (staticmap.openstreetmap.de est down, Geoapify exige une clé) → on assemble nous-mêmes
 * une mosaïque 3×3 centrée sur le lieu, qu'on décale pour que le point tombe pile au centre.
 *
 * Maths « slippy map » standard (OpenStreetMap) : web-mercator → coordonnées de tuiles.
 */

const TILE = 256; // taille d'affichage d'une tuile (la source @2x fait 512px → net en retina)
const SUBS = ['a', 'b', 'c', 'd'] as const;

const lngToX = (lng: number, z: number): number => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z;
};

export type MapTile = { uri: string; left: number; top: number };
export type MapMosaic = {
  tiles: MapTile[];
  /** Décalage du bloc 3×3 dans la bannière pour centrer le lieu. */
  offsetX: number;
  offsetY: number;
  blockSize: number;
  tileSize: number;
};

/**
 * Mosaïque 3×3 de tuiles CARTO centrée sur (lat,lng), positionnée pour qu'une bannière de taille
 * `bannerW × bannerH` montre le lieu pile au centre. `zoom` 15 ≈ échelle quartier.
 */
export function tileMosaic(lat: number, lng: number, bannerW: number, bannerH: number, zoom = 15): MapMosaic {
  const n = 2 ** zoom;
  const x = lngToX(lng, zoom);
  const y = latToY(lat, zoom);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const fracX = x - tx;
  const fracY = y - ty;

  const tiles: MapTile[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const Y = ty + dy;
    if (Y < 0 || Y >= n) continue; // pas de tuile hors planète en latitude
    for (let dx = -1; dx <= 1; dx++) {
      const X = (((tx + dx) % n) + n) % n; // longitude wrap
      const s = SUBS[Math.abs(tx + dx + ty + dy) % 4];
      tiles.push({
        uri: `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${X}/${Y}@2x.png`,
        left: (dx + 1) * TILE,
        top: (dy + 1) * TILE,
      });
    }
  }

  // Pixel du lieu dans le bloc (la tuile centrale occupe [TILE, 2·TILE]).
  const venueX = (1 + fracX) * TILE;
  const venueY = (1 + fracY) * TILE;
  return {
    tiles,
    offsetX: bannerW / 2 - venueX,
    offsetY: bannerH / 2 - venueY,
    blockSize: 3 * TILE,
    tileSize: TILE,
  };
}
