// Scraper de lieux pour la Carte — ÉCHELLE NATIONALE (toute la France, OSM/Overpass).
// Généralise scrape-venues.mjs (qui était limité à Paris intra-muros) à l'ensemble du pays.
//
// Stratégie (respectueuse de l'API publique Overpass) :
//  1) UNE requête nationale pour les tables (sport=table_tennis) — léger (out center tags).
//  2) Clustering des tables proches en "spots" via un index spatial (O(n), reste rapide à l'échelle FR).
//  3) Géométrie des parcs/squares + noms de villes récupérée UNIQUEMENT par tuile occupée
//     (pas toute la France d'un coup) — throttling + retry/backoff.
//  4) Nommage : point-in-polygon (parc/square/gymnase) + ville (place node le plus proche).
//  5) Upsert idempotent dans public.venues (source='openstreetmap' ; les lieux 'manuel' préservés).
//
// Écriture — 3 modes :
//   • Postgres direct :  node scripts/scrape-venues-fr.mjs "postgres://...";
//   • REST service-role: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/scrape-venues-fr.mjs
//   • Dry-run (rien écrit, juste les stats) : node scripts/scrape-venues-fr.mjs --dry
//
// Options : --tile=0.5 (taille des tuiles en degrés)  --bbox=S,W,N,E (limiter la zone, ex. test)  --sleep=1200 (ms)
// (le paquet `pg` n'est importé qu'en mode connexion Postgres directe — voir plus bas)

const argv = process.argv.slice(2);
const flag = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const has = (k) => argv.includes(`--${k}`);

const conn = argv.find((x) => x.startsWith('postgres://') || x.startsWith('postgresql://'));
const DRY = has('dry');
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Plusieurs miroirs Overpass : on tourne dessus pour répartir la charge et éviter les 429.
// Surcharge possible : OVERPASS_URL=https://... (un seul miroir).
const MIRRORS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];
const UA = 'PingPangParis/1.0 (club app; contact dev@pingpang.paris)';
const CLUSTER_M = 30;                       // rayon de regroupement des tables en un même spot
const TILE_DEG = Number(flag('tile', '0.5')); // taille des tuiles pour la géométrie (degrés)
const SLEEP_MS = Number(flag('sleep', '1200')); // pause entre 2 requêtes Overpass
const PLACE_MAX_M = 12000;                   // distance max à une commune pour en hériter le nom (couvre le rural)
// France entière (métropole + Corse). bbox des tables, surchargée par --bbox pour tester une zone.
const FR_BBOX = (flag('bbox', '41.3,-5.2,51.1,9.6')).split(',').map(Number); // S,W,N,E

if (!DRY && !conn && !(SVC && BASE)) {
  console.error('Écriture impossible : fournis une conn Postgres en argument, OU SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL, OU --dry.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ACTIVE = [...MIRRORS]; // miroirs vivants (réduit par probeMirrors au démarrage)
let mirrorRR = 0;          // round-robin sur les miroirs

// Sonde chaque miroir avec une requête triviale ; ne garde que ceux qui répondent du JSON, triés par latence.
async function probeMirrors() {
  if (MIRRORS.length <= 1) return;
  const q = '[out:json][timeout:15];node["place"="city"]["name"="Lyon"];out;';
  const res = await Promise.all(MIRRORS.map(async (u) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000); const t0 = Date.now();
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body: 'data=' + encodeURIComponent(q), signal: ac.signal });
      const j = await r.json(); clearTimeout(t);
      if (r.ok && Array.isArray(j.elements)) return { u, ms: Date.now() - t0 };
    } catch { /* mort */ }
    clearTimeout(t); return null;
  }));
  const live = res.filter(Boolean).sort((a, b) => a.ms - b.ms);
  // On garde les miroirs RAPIDES (<6 s) ; au moins les 2 meilleurs même s'ils dépassent le seuil.
  // Un miroir lent dans le round-robin ralentit 1 requête sur N inutilement.
  const fast = live.filter((x) => x.ms < 6000);
  const keep = (fast.length >= 2 ? fast : live.slice(0, 2));
  if (keep.length) ACTIVE = keep.map((x) => x.u);
  console.log(`miroirs gardés: ${keep.map((x) => `${new URL(x.u).host}(${(x.ms / 1000).toFixed(1)}s)`).join(', ') || 'aucun — fallback liste complète'}`
    + (live.length > keep.length ? `  (écartés lents: ${live.slice(keep.length).map((x) => new URL(x.u).host).join(', ')})` : ''));
}

async function overpass(query, { tries = 8, timeoutMs = 90000 } = {}) {
  let wait = 1500;
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = ACTIVE[(mirrorRR++) % ACTIVE.length]; // on change de miroir à chaque tentative
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs); // timeout client : annule un miroir qui pend
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: ac.signal,
      });
      if (r.ok) { const j = await r.json(); clearTimeout(timer); return j; } // corps lu sous timeout
      clearTimeout(timer);
      // 429 (rate limit) / 5xx → on bascule de miroir avec un petit backoff
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`overpass ${r.status} @ ${new URL(url).host}`); await sleep(wait); wait = Math.min(wait * 1.7, 15000); continue;
      }
      throw new Error(`overpass ${r.status}`);
    } catch (e) {
      clearTimeout(timer);
      if (e.message?.startsWith('overpass ') && !e.message.includes('@')) throw e; // 4xx non-retryable
      lastErr = e; await sleep(wait); wait = Math.min(wait * 1.7, 15000); continue;
    }
  }
  throw lastErr ?? new Error('overpass: échec après tentatives');
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
function bboxOf(ring) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of ring) { if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon; }
  return { s, w, n, e };
}
const isIndoor = (t) => t.indoor === 'yes' || t.covered === 'yes' || !!t.building || t.access === 'customers';

// Index spatial simple (hash de cellules) pour le clustering en O(n) à l'échelle nationale.
function gridKey(lat, lon, cell) { return `${Math.floor(lat / cell)}:${Math.floor(lon / cell)}`; }

const main = async () => {
  const [S, W, N, E] = FR_BBOX;
  console.log(`Zone: ${S},${W},${N},${E}  | tuiles ${TILE_DEG}°  | mode: ${DRY ? 'DRY-RUN' : conn ? 'pg' : 'REST'}`);
  await probeMirrors(); // ne garder que les miroirs Overpass réactifs

  // 1) TABLES — bornées à la FRONTIÈRE réelle de la France (area ISO3166-1=FR), pas un rectangle :
  //    sinon la bbox déborde sur Suisse/Allemagne/Belgique/Espagne/Italie et capture leurs tables.
  //    --bbox=… force le mode rectangle (tests sur une zone).
  const bboxMode = argv.some((x) => x.startsWith('--bbox='));
  console.log(`1/5  Récupération des tables sport=table_tennis (${bboxMode ? 'bbox' : 'frontière FR'})…`);
  const tablesQuery = bboxMode
    ? `[out:json][timeout:300];(nwr["sport"="table_tennis"](${S},${W},${N},${E}););out center tags;`
    : `[out:json][timeout:300];area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;(nwr["sport"="table_tennis"](area.fr););out center tags;`;
  const tablesRaw = (await overpass(tablesQuery, { timeoutMs: 240000 })).elements; // requête lourde : large fenêtre client
  const tables = tablesRaw
    .map((e) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, t: e.tags || {} }))
    .filter((e) => e.lat && e.lon && e.t.access !== 'private' && e.t.access !== 'no');
  console.log(`     tables OSM: ${tablesRaw.length} -> publiques: ${tables.length}`);
  await sleep(SLEEP_MS);

  // 2) CLUSTERING via index spatial (cellule ≈ CLUSTER_M)
  const cell = CLUSTER_M / 111000; // ~deg pour 30m
  const grid = new Map(); // key -> [siteIndex,...]
  const sites = [];
  for (const e of tables) {
    let f = null;
    const ci = Math.floor(e.lat / cell), cj = Math.floor(e.lon / cell);
    for (let di = -1; di <= 1 && !f; di++) for (let dj = -1; dj <= 1 && !f; dj++) {
      const arr = grid.get(`${ci + di}:${cj + dj}`);
      if (arr) for (const idx of arr) { if (distM(sites[idx], e) < CLUSTER_M) { f = sites[idx]; break; } }
    }
    if (f) { f.n++; f.indoor = f.indoor || isIndoor(e.t); }
    else {
      const idx = sites.length;
      sites.push({ lat: e.lat, lon: e.lon, n: 1, indoor: isIndoor(e.t) });
      const k = `${ci}:${cj}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(idx);
    }
  }
  console.log(`2/5  spots (clusters): ${sites.length}  (multi-tables: ${sites.filter((s) => s.n > 1).length})`);

  // 3) TUILES OCCUPÉES — on ne récupère la géométrie que là où il y a des spots
  const occupied = new Map(); // key -> {s,w,n,e}
  for (const s of sites) {
    const ti = Math.floor(s.lat / TILE_DEG), tj = Math.floor(s.lon / TILE_DEG);
    occupied.set(`${ti}:${tj}`, {
      s: ti * TILE_DEG, w: tj * TILE_DEG, n: (ti + 1) * TILE_DEG, e: (tj + 1) * TILE_DEG,
    });
  }
  console.log(`3/5  tuiles occupées (parcs ${TILE_DEG}°): ${occupied.size}`);

  // 3) VILLES — sur tuiles GROSSIÈRES (2°) : place nodes sans géométrie = léger, peu de requêtes.
  //    (La requête nationale unique est trop lourde pour les instances publiques : >120 s.)
  //    Indexées dans une grille 0.1° pour l'affectation du plus proche.
  const CITY_TILE = 2.0;
  const cityTiles = new Map();
  for (const s of sites) {
    const ti = Math.floor(s.lat / CITY_TILE), tj = Math.floor(s.lon / CITY_TILE);
    cityTiles.set(`${ti}:${tj}`, { s: ti * CITY_TILE, w: tj * CITY_TILE, n: (ti + 1) * CITY_TILE, e: (tj + 1) * CITY_TILE });
  }
  console.log(`     Récupération des communes sur ${cityTiles.size} tuiles ${CITY_TILE}° (requêtes légères)…`);
  const places = [];
  const seenPlace = new Set();
  const PAD = 0.02; // marge pour capter un parc qui déborde de la tuile
  let ci = 0, cfail = 0;
  for (const [, t] of cityTiles) {
    ci++;
    const bbox = `${t.s.toFixed(4)},${t.w.toFixed(4)},${t.n.toFixed(4)},${t.e.toFixed(4)}`;
    // communes restreintes à la France (sauf mode test --bbox) → pas de ville étrangère sur un spot frontalier
    const cq = bboxMode
      ? `[out:json][timeout:90];node["place"~"city|town|village"]["name"](${bbox});out;`
      : `[out:json][timeout:90];area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;node["place"~"city|town|village"]["name"](area.fr)(${bbox});out;`;
    try {
      const el = (await overpass(cq, { timeoutMs: 60000 })).elements;
      for (const w of el) {
        if (w.type !== 'node' || !w.tags?.place) continue;
        const id = `${w.lat},${w.lon}`;
        if (seenPlace.has(id)) continue; // dédoublonnage (tuiles qui se chevauchent via PAD)
        seenPlace.add(id);
        const rank = { city: 2, town: 1, village: 0 }[w.tags.place] ?? 0;
        places.push({ name: w.tags.name, lat: w.lat, lon: w.lon, rank });
      }
    } catch (e) { cfail++; }
    if (ci % 10 === 0 || ci === cityTiles.size) console.log(`     communes ${ci}/${cityTiles.size}  (trouvées: ${places.length}, tuiles échouées: ${cfail})`);
    await sleep(SLEEP_MS);
  }
  const PCELL = 0.1; // ~11 km
  const pgrid = new Map();
  for (let i = 0; i < places.length; i++) {
    const k = gridKey(places[i].lat, places[i].lon, PCELL);
    if (!pgrid.has(k)) pgrid.set(k, []);
    pgrid.get(k).push(i);
  }

  // 4) PARCS — opt-in (--parks) : géométrie lourde par tuile, nomme les spots outdoor. OFF par défaut.
  const areas = []; // {name, leisure, ring, area, bb}
  if (!has('parks')) {
    console.log('4/5  parcs: ignorés (ajoute --parks pour nommer par parc/square — plus lent)');
  } else {
    console.log(`4/5  Géométrie des parcs sur ${occupied.size} tuiles (best-effort, miroirs alternés)…`);
    let ti = 0, failed = 0;
    for (const [key, t] of occupied) {
      ti++;
      const bbox = `${(t.s - PAD).toFixed(4)},${(t.w - PAD).toFixed(4)},${(t.n + PAD).toFixed(4)},${(t.e + PAD).toFixed(4)}`;
      try {
        const el = (await overpass(
          `[out:json][timeout:120];` +
          // `pitch` retiré : tag le plus volumineux et peu pertinent comme nom de spot
          `(way["leisure"~"park|garden|common|recreation_ground|sports_centre|stadium|playground"]["name"](${bbox});` +
          `way["amenity"="community_centre"]["name"](${bbox}););out geom;`,
          { timeoutMs: 120000 }, // géométrie lourde sur tuiles denses : large fenêtre client
        )).elements;
        for (const w of el) {
          if (Array.isArray(w.geometry) && w.geometry.length >= 3) {
            areas.push({ name: w.tags.name, leisure: w.tags.leisure, ring: w.geometry, area: ringArea(w.geometry), bb: bboxOf(w.geometry) });
          }
        }
      } catch (e) { failed++; }
      if (ti % 20 === 0 || ti === occupied.size) console.log(`     parcs ${ti}/${occupied.size}  (polygones: ${areas.length}, tuiles échouées: ${failed})`);
      await sleep(SLEEP_MS);
    }
  }
  areas.sort((a, b) => a.area - b.area); // le plus petit polygone l'emporte (le plus précis)

  // 5) NOMMAGE — point-in-polygon (parc) + commune la plus proche (via grille 0.1°)
  console.log('5/5  Nommage (parc + commune)…');
  let named = 0, withCity = 0;
  for (const s of sites) {
    const host = areas.find((a) => s.lat >= a.bb.s && s.lat <= a.bb.n && s.lon >= a.bb.w && s.lon <= a.bb.e && inRing(s, a.ring));
    if (host) { s.placeName = host.name; if (host.leisure === 'sports_centre' || host.leisure === 'stadium') s.indoor = true; named++; }
    // commune : on ne teste que les place nodes des cellules voisines (rayon ≈ 1 cellule = ~11 km)
    const ci = Math.floor(s.lat / PCELL), cj = Math.floor(s.lon / PCELL);
    let best = null, bestScore = Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const arr = pgrid.get(`${ci + di}:${cj + dj}`);
      if (!arr) continue;
      for (const idx of arr) {
        const p = places[idx];
        const d = distM(s, p);
        if (d > PLACE_MAX_M) continue;
        const score = d - p.rank * 500; // bonus pour ville > village à distance comparable
        if (score < bestScore) { bestScore = score; best = p; }
      }
    }
    if (best) { s.city = best.name; withCity++; }
    s.name = (s.placeName ?? 'Tables de ping-pong') + (s.n > 1 ? ` (${s.n} tables)` : '');
    s.address = s.city ?? null;
  }
  console.log(`     nommés par un parc/square: ${named} | avec commune: ${withCity}/${sites.length}`);

  // résumé top-villes
  const byCity = {};
  for (const s of sites) { const c = s.city ?? '(sans ville)'; byCity[c] = (byCity[c] ?? 0) + 1; }
  const top = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('     top villes:', top.map(([c, n]) => `${c}:${n}`).join('  '));

  if (DRY) {
    console.log('\n--dry : aucune écriture. Échantillon :');
    for (const s of sites.slice(0, 8)) console.log(`   • ${s.name} — ${s.address ?? '?'} (${s.lat.toFixed(5)},${s.lon.toFixed(5)})${s.indoor ? ' [indoor]' : ''}`);
    console.log(`\nTOTAL spots prêts à insérer: ${sites.length}`);
    console.log('SCRAPE_OK');
    return;
  }

  // 6) UPSERT idempotent
  if (conn) {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      await c.query("delete from venues where source = 'openstreetmap'");
      let inserted = 0;
      for (let i = 0; i < sites.length; i += 200) {
        const slice = sites.slice(i, i + 200);
        const ph = slice.map((_, k) => { const b = k * 5; return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},'openstreetmap')`; });
        const v = slice.flatMap((s) => [s.name, s.address, Number(s.lat.toFixed(6)), Number(s.lon.toFixed(6)), !!s.indoor]);
        await c.query(`insert into venues (name, address, lat, lng, indoor, source) values ${ph.join(',')}`, v);
        inserted += slice.length;
      }
      const tot = (await c.query('select count(*)::int n from venues')).rows[0].n;
      console.log(`6/6  inséré: ${inserted} | venues total: ${tot}`);
    } finally { await c.end().catch(() => {}); }
  } else {
    const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
    const del = await fetch(`${BASE}/rest/v1/venues?source=eq.openstreetmap`, { method: 'DELETE', headers: H });
    if (!del.ok) throw new Error(`delete OSM ${del.status}: ${await del.text()}`);
    console.log(`     anciens OSM supprimés (HTTP ${del.status})`);
    let inserted = 0;
    for (let i = 0; i < sites.length; i += 200) {
      const slice = sites.slice(i, i + 200).map((s) => ({
        name: s.name, address: s.address, lat: Number(s.lat.toFixed(6)), lng: Number(s.lon.toFixed(6)),
        indoor: !!s.indoor, source: 'openstreetmap',
      }));
      const r = await fetch(`${BASE}/rest/v1/venues`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(slice) });
      if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
      inserted += slice.length;
    }
    const cnt = await fetch(`${BASE}/rest/v1/venues?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    const total = cnt.headers.get('content-range')?.split('/')?.[1] ?? '?';
    console.log(`6/6  inséré: ${inserted} | venues total: ${total}`);
  }
  console.log('SCRAPE_OK');
};

main().catch((e) => { console.error('SCRAPE_ERROR:', e.message); process.exit(1); });
