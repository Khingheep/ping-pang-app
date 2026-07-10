import maplibregl from 'maplibre-gl';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { Palette } from '@/constants/theme';
import type { LatLng } from '@/lib/location/distance';
import { MAP_STYLE } from './map-style';
import type { Bbox, MapPoint, VenueMapHandle } from './venue-map-html';

export type { Bbox, MapPoint, VenueMapHandle };

type Props = {
  points: MapPoint[];
  user?: LatLng | null;
  onReady?: () => void;
  onSelectVenue?: (id: string) => void;
  onBoundsChange?: (b: Bbox) => void;
};

const PARIS: [number, number] = [2.3522, 48.8566]; // [lng, lat]
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';

/** Décale le centre vers le bas (~40% écran) → fait remonter le point au-dessus du panneau. */
const lift = () => ({ bottom: typeof window !== 'undefined' ? window.innerHeight * 0.4 : 0 });

const venuesFC = (points: MapPoint[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: points.map((p) => ({
    type: 'Feature',
    id: p.id,
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { id: p.id, name: p.name, slots: p.slots ?? 0, indoor: p.indoor ? 1 : 0 },
  })),
});

const userFC = (user?: LatLng | null): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: user ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [user.lng, user.lat] }, properties: {} }] : [],
});

const toBbox = (b: maplibregl.LngLatBounds): Bbox => ({ n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() });

/**
 * Carte (web/PWA) : MapLibre GL JS rendu directement dans le navigateur (pas de WebView → plein débit).
 * Partage le MÊME style vectoriel custom que le natif (map-style.ts) → look identique sur les 2 plateformes.
 * Mêmes props & VenueMapHandle que la variante native (carte.tsx inchangé).
 */
export const VenueMap = forwardRef<VenueMapHandle, Props>(function VenueMap(
  { points, user, onReady, onSelectVenue, onBoundsChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const centered = useRef(false);
  // Données + callbacks dans des refs → la carte n'est jamais ré-initialisée (cadrage préservé).
  const data = useRef({ points, user });
  data.current = { points, user };
  const cb = useRef({ onReady, onSelectVenue, onBoundsChange });
  cb.current = { onReady, onSelectVenue, onBoundsChange };

  const sync = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource('venues') as maplibregl.GeoJSONSource | undefined)?.setData(venuesFC(data.current.points));
    (map.getSource('me') as maplibregl.GeoJSONSource | undefined)?.setData(userFC(data.current.user));
  };

  // Initialisation unique de la carte.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // CSS MapLibre via CDN (évite tout souci de bundling, comme l'ancien Leaflet).
    if (typeof document !== 'undefined' && !document.getElementById('maplibregl-css')) {
      const link = document.createElement('link');
      link.id = 'maplibregl-css';
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_CSS;
      document.head.appendChild(link);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: PARIS,
      zoom: 12,
    });
    mapRef.current = map;

    map.on('load', () => {
      loaded.current = true;
      map.addSource('venues', { type: 'geojson', data: venuesFC([]) });
      map.addSource('me', { type: 'geojson', data: userFC(null) });

      // Table sans créneau : point evergreen (outdoor) / bleu (indoor)
      map.addLayer({
        id: 'venue-dot',
        type: 'circle',
        source: 'venues',
        filter: ['==', ['get', 'slots'], 0],
        paint: {
          'circle-radius': 7,
          'circle-color': ['case', ['==', ['get', 'indoor'], 1], Palette.blue, Palette.onyx],
          'circle-stroke-width': 2,
          'circle-stroke-color': Palette.white,
        },
      });
      // Table avec créneaux : pastille lime bordée evergreen + nombre
      map.addLayer({
        id: 'venue-slot-bg',
        type: 'circle',
        source: 'venues',
        filter: ['>', ['get', 'slots'], 0],
        paint: { 'circle-radius': 13, 'circle-color': Palette.lime, 'circle-stroke-width': 2, 'circle-stroke-color': Palette.onyx },
      });
      map.addLayer({
        id: 'venue-slot-count',
        type: 'symbol',
        source: 'venues',
        filter: ['>', ['get', 'slots'], 0],
        layout: {
          'text-field': ['to-string', ['get', 'slots']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': Palette.evergreen },
      });
      // Ma position (point violet)
      map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 14, 'circle-color': Palette.purple, 'circle-opacity': 0.25 } });
      map.addLayer({
        id: 'me-dot',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 7, 'circle-color': Palette.purple, 'circle-stroke-width': 3, 'circle-stroke-color': Palette.white },
      });

      const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (!id) return;
        cb.current.onSelectVenue?.(id);
        if (f && f.geometry.type === 'Point') {
          map.flyTo({ center: f.geometry.coordinates as [number, number], zoom: 15, padding: lift(), duration: 450 });
        }
      };
      for (const layer of ['venue-dot', 'venue-slot-bg'] as const) {
        map.on('click', layer, onClick);
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }

      sync();
      cb.current.onBoundsChange?.(toBbox(map.getBounds())); // viewport initial
      cb.current.onReady?.();
    });

    // Déplacement terminé → on remonte le cadre visible pour charger les tables du viewport.
    map.on('moveend', () => cb.current.onBoundsChange?.(toBbox(map.getBounds())));

    return () => {
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus: (id) => {
      const p = data.current.points.find((x) => x.id === id);
      if (p) mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, padding: lift(), duration: 450 });
    },
    focusAt: (lat, lng) => mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, padding: lift(), duration: 450 }),
    flyTo: (lat, lng, z) => mapRef.current?.flyTo({ center: [lng, lat], zoom: z ?? 15, duration: 500 }),
  }));

  // Données poussées quand elles changent (source.setData, la carte n'est pas recréée).
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  useEffect(() => {
    sync();
    if (user && !centered.current && mapRef.current) {
      centered.current = true;
      mapRef.current.flyTo({ center: [user.lng, user.lat], zoom: 15, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});
