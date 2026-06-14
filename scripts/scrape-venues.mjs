// Scraper de lieux pour la Carte : tables de tennis de table de Paris via OpenStreetMap (Overpass).
// - récupère les tables (sport=table_tennis) + les espaces nommés (parcs/squares) avec géométrie
// - clusterise les tables proches en "spots", nomme chaque spot par le parc/square qui le contient
//   (point-in-polygon, donc AUCUN geocoding massif — respectueux des API)
// - upsert idempotent dans public.venues (source='openstreetmap' ; les lieux 'manuel' sont préservés)
// Usage: node scripts/scrape-venues.mjs "<conn>"
import pg from 'pg';

const conn = process.argv[2];
if (!conn) { console.error('Usage: node scripts/scrape-venues.mjs "<conn>"'); process.exit(2); }

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

const main = async () => {
  // 1) tables
  const tablesRaw = (await overpass(
    `[out:json][timeout:40];(nwr["sport"="table_tennis"](${BBOX}););out center tags;`,
  )).elements;
  const tables = tablesRaw
    .map((e) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, t: e.tags || {} }))
    .filter((e) => e.lat && e.lon && e.t.access !== 'private' && e.t.access !== 'no'); // garde le public
  console.log(`tables OSM: ${tablesRaw.length} -> publiques: ${tables.length}`);

  // 2) espaces nommés (parcs/squares/gymnases) avec géométrie
  const areas = (await overpass(
    `[out:json][timeout:60];(way["leisure"~"park|garden|common|recreation_ground|pitch|sports_centre|stadium|playground"]["name"](${BBOX});way["amenity"="community_centre"]["name"](${BBOX}););out geom;`,
  )).elements
    .filter((w) => Array.isArray(w.geometry) && w.geometry.length >= 3)
    .map((w) => ({ name: w.tags.name, leisure: w.tags.leisure, ring: w.geometry, area: ringArea(w.geometry) }))
    .sort((a, b) => a.area - b.area); // plus petit d'abord -> le plus précis l'emporte
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
  console.log(`spots: ${sites.length} (nommés par un parc/square: ${named}, multi-tables: ${sites.filter((s) => s.n > 1).length})`);

  // 5) upsert idempotent
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("delete from venues where source = 'openstreetmap'");
    let inserted = 0;
    for (let i = 0; i < sites.length; i += 200) {
      const slice = sites.slice(i, i + 200);
      const ph = slice.map((_, k) => {
        const b = k * 5;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},'openstreetmap')`;
      });
      const v = slice.flatMap((s) => [s.name, s.address, Number(s.lat.toFixed(6)), Number(s.lon.toFixed(6)), !!s.indoor]);
      await c.query(`insert into venues (name, address, lat, lng, indoor, source) values ${ph.join(',')}`, v);
      inserted += slice.length;
    }
    const tot = (await c.query('select count(*)::int n from venues')).rows[0].n;
    console.log(`inséré: ${inserted} | venues total: ${tot}`);
    console.log('SCRAPE_OK');
  } finally {
    await c.end().catch(() => {});
  }
};

function isIndoor(t) {
  return t.indoor === 'yes' || t.covered === 'yes' || !!t.building || t.access === 'customers';
}

main().catch((e) => { console.error('SCRAPE_ERROR:', e.message); process.exit(1); });
