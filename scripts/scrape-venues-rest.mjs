// Variante REST de scrape-venues.mjs : écrit via l'API Supabase (PostgREST) au lieu d'une
// connexion Postgres directe. Pratique quand on n'a que la clé service_role (pas la conn string).
// - récupère les tables (sport=table_tennis) de Paris via OpenStreetMap (Overpass)
// - clusterise les tables proches en "spots", nomme chaque spot par le parc/square qui le contient
// - upsert idempotent dans public.venues (source='openstreetmap' ; les lieux 'manuel' sont préservés)
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/scrape-venues-rest.mjs
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!SVC || !BASE) {
  console.error('SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL requis');
  process.exit(2);
}
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const BBOX = '48.80,2.22,48.91,2.47'; // Paris intra-muros (+marge)
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'PingPangParis/1.0 (club app; contact dev@pingpang.paris)';
const CLUSTER_M = 30;

async function overpass(query) {
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!r.ok) throw new Error(`overpass ${r.status}`);
  return r.json();
}

// --- géométrie ---
const R = 6371000, rad = (x) => (x * Math.PI) / 180;
function distM(a, b) {
  const dphi = rad(b.lat - a.lat), dl = rad(b.lon - a.lon), la = rad(a.lat), lb = rad(b.lat);
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lon, yj = ring[j].lat, xj = ring[j].lon;
    if ((yi > pt.lat) !== (yj > pt.lat) && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].lon * ring[i].lat - ring[i].lon * ring[j].lat;
  return Math.abs(a / 2);
}
function isIndoor(t) {
  return t.indoor === 'yes' || t.covered === 'yes' || !!t.building || t.access === 'customers';
}

const main = async () => {
  // 1) tables
  const tablesRaw = (await overpass(
    `[out:json][timeout:40];(nwr["sport"="table_tennis"](${BBOX}););out center tags;`,
  )).elements;
  const tables = tablesRaw
    .map((e) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, t: e.tags || {} }))
    .filter((e) => e.lat && e.lon && e.t.access !== 'private' && e.t.access !== 'no');
  console.log(`tables OSM: ${tablesRaw.length} -> publiques: ${tables.length}`);

  // 2) espaces nommés (parcs/squares/gymnases) avec géométrie
  const areas = (await overpass(
    `[out:json][timeout:60];(way["leisure"~"park|garden|common|recreation_ground|pitch|sports_centre|stadium|playground"]["name"](${BBOX});way["amenity"="community_centre"]["name"](${BBOX}););out geom;`,
  )).elements
    .filter((w) => Array.isArray(w.geometry) && w.geometry.length >= 3)
    .map((w) => ({ name: w.tags.name, leisure: w.tags.leisure, ring: w.geometry, area: ringArea(w.geometry) }))
    .sort((a, b) => a.area - b.area);
  console.log(`espaces nommés: ${areas.length}`);

  // 3) cluster greedy
  const sites = [];
  for (const e of tables) {
    const f = sites.find((c) => distM(c, e) < CLUSTER_M);
    if (f) { f.n++; f.indoor = f.indoor || isIndoor(e.t); }
    else sites.push({ lat: e.lat, lon: e.lon, n: 1, indoor: isIndoor(e.t) });
  }

  // 4) nommage par point-in-polygon
  let named = 0;
  for (const s of sites) {
    const host = areas.find((a) => inRing(s, a.ring));
    if (host) { s.placeName = host.name; if (host.leisure === 'sports_centre' || host.leisure === 'stadium') s.indoor = true; named++; }
    s.name = (s.placeName ?? 'Table de ping-pong') + (s.n > 1 ? ` (${s.n} tables)` : '');
    s.address = s.placeName ? 'Paris' : null;
  }
  console.log(`spots: ${sites.length} (nommés: ${named}, multi-tables: ${sites.filter((s) => s.n > 1).length})`);

  // 5) upsert idempotent via PostgREST
  // 5a) purge des anciens OSM
  const del = await fetch(`${BASE}/rest/v1/venues?source=eq.openstreetmap`, { method: 'DELETE', headers: H });
  if (!del.ok) throw new Error(`delete OSM ${del.status}: ${await del.text()}`);
  console.log(`anciens OSM supprimés (HTTP ${del.status})`);

  // 5b) insert par lots
  let inserted = 0;
  for (let i = 0; i < sites.length; i += 200) {
    const slice = sites.slice(i, i + 200).map((s) => ({
      name: s.name,
      address: s.address,
      lat: Number(s.lat.toFixed(6)),
      lng: Number(s.lon.toFixed(6)),
      indoor: !!s.indoor,
      source: 'openstreetmap',
    }));
    const r = await fetch(`${BASE}/rest/v1/venues`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(slice),
    });
    if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
    inserted += slice.length;
  }

  const cnt = await fetch(`${BASE}/rest/v1/venues?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const total = cnt.headers.get('content-range')?.split('/')?.[1] ?? '?';
  console.log(`inséré: ${inserted} | venues total: ${total}`);
  console.log('SCRAPE_OK');
};

main().catch((e) => { console.error('SCRAPE_ERROR:', e.message); process.exit(1); });
