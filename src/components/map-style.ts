/**
 * Style vectoriel CUSTOM Ping Pang pour MapLibre - c'est le « beau » de la carte.
 *
 * Rendu light, épuré, façon TheFork : fond off-white, eau bleu doux, parcs vert tendre,
 * routes blanches, AUCUN POI du fond (resto/magasins masqués) → seuls nos pins de tables
 * ressortent. Recoloré 100% sur la palette de marque (cf. constants/theme).
 *
 * Tuiles : OpenFreeMap (schéma OpenMapTiles), gratuites, SANS clé API ni limite de loads.
 * Re-skin de la carte = on touche ce fichier uniquement (comme constants/theme pour l'app).
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { Palette } from '@/constants/theme';

/** Teintes douces dérivées de la marque (les fills clairs n'existent pas tels quels dans Palette). */
const C = {
  bg: Palette.whitePP, // #F5F6F3 - fond
  water: '#C2D8F2', // bleu doux (parent de Palette.blue, désaturé)
  waterLine: '#A9C6EC',
  park: '#DEEAC8', // vert tendre (tables outdoor souvent en parc → on les met en valeur)
  wood: '#D6E3BC',
  grass: '#E3ECD3',
  building: '#ECEDE6',
  roadFill: Palette.white, // routes blanches sur fond off-white = look TheFork
  roadCasing: '#E5E5E0',
  roadMinor: '#FAFAF8',
  path: '#D8D8D2',
  boundary: '#C6C6C0',
  label: Palette.onyx, // #101010 - villes
  labelSub: Palette.grey, // #8C8C8C - quartiers
  halo: Palette.white,
} as const;

const OFM = 'https://tiles.openfreemap.org';

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'Ping Pang',
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: `${OFM}/planet`,
      attribution: 'OpenFreeMap · OpenMapTiles · © OpenStreetMap',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': C.bg } },

    // Couvert végétal (bois / herbe)
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', C.wood, 'grass', C.grass, C.grass],
        'fill-opacity': 0.5,
      },
    },
    // Parcs (mis en avant : c'est là que sont la plupart des tables outdoor)
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': C.park, 'fill-opacity': 0.65 },
    },

    // Eau
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': C.water } },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: { 'line-color': C.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2] },
    },

    // Bâtiments (apparaissent en zoom proche)
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': C.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1] },
    },

    // Routes - contour (casing) puis remplissage blanc
    {
      id: 'road-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.roadCasing, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 3, 16, 12] },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 4, 18, 10] },
    },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.roadFill, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 12, 2, 16, 9] },
    },
    // Chemins piétons (accès aux tables de parc)
    {
      id: 'path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['path', 'pedestrian']]],
      paint: { 'line-color': C.path, 'line-width': 1, 'line-dasharray': [2, 2] },
    },

    // Frontières administratives (pays / régions)
    {
      id: 'boundary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 4],
      paint: {
        'line-color': C.boundary,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.5],
        'line-dasharray': [3, 2],
      },
    },

    // Labels de lieux (villes/villages) - pas de POI : la carte reste propre pour nos pins
    {
      id: 'place-major',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 16],
      },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-minor',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb', 'neighbourhood', 'quarter']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13],
      },
      paint: { 'text-color': C.labelSub, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
  ],
};
