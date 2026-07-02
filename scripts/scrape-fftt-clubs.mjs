// Ingestion des CLUBS FFTT (avec GPS + adresse) comme venues, pour que le lien FFTT retrouve
// le club du joueur et l'épingle sur la carte.
//
// Source : la carte officielle FFTT — POST https://carte.fftt.com/ajax_get_data par département
// (~101 requêtes, pas d'auth ni CAPTCHA). Chaque club a 1..N salles déjà géocodées.
// Écriture via l'API REST Supabase (service_role), idempotente : delete source='fftt' puis insert.
//
// Usage :
//   SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/scrape-fftt-clubs.mjs
//   node scripts/scrape-fftt-clubs.mjs --dry 75 92      # valide le parsing, n'écrit rien
//   node scripts/scrape-fftt-clubs.mjs 75 77 91 92 93 94 95   # Île-de-France seulement

const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const depArgs = argv.filter((a) => a !== '--dry');

if (!DRY && (!SVC || !BASE)) {
  console.error('SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL requis (ou utilise --dry)');
  process.exit(2);
}
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const ENDPOINT = 'https://carte.fftt.com/ajax_get_data';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// 01-19, 2A/2B, 21-95 + DOM.
const ALL_DEPTS = [
  ...Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')),
  '2A',
  '2B',
  ...Array.from({ length: 75 }, (_, i) => String(i + 21).padStart(2, '0')),
  '971',
  '972',
  '973',
  '974',
  '976',
];
const DEPTS = depArgs.length ? depArgs : ALL_DEPTS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDept(dep) {
  const body = new URLSearchParams({
    structures_department: dep,
    structures_zipcode: '',
    structures_city: '',
    structures_code: '',
    club_identifier: '',
    club_gps: '',
    search_range: '50',
    departement_gps: '',
  }).toString();
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'https://carte.fftt.com/',
      Origin: 'https://carte.fftt.com',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const clean = (s) => (s ?? '').toString().trim();

/** clubsCoords = { nomClub: [salles...] } → liste de clubs normalisés. */
function extractClubs(raw) {
  const data = raw?.clubsCoords;
  if (!data || typeof data !== 'object') return [];
  const out = [];
  for (const [name, halls] of Object.entries(data)) {
    if (!Array.isArray(halls) || !halls.length) continue;
    out.push({
      numero: clean(halls[0].numero),
      name: clean(name),
      halls: halls.map((h) => ({
        name: clean(h.name),
        lat: Number(h.latitude),
        lng: Number(h.longitude),
        street: clean(h.street_address),
        postal: clean(h.postal_code),
        city: clean(h.address_locality),
      })),
    });
  }
  return out;
}

/** Un club → 1 venue par salle géocodée. Nom = club (+ ville si plusieurs salles, pour distinguer). */
function clubToVenues(club) {
  const geocoded = club.halls.filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && (h.lat !== 0 || h.lng !== 0));
  const multi = geocoded.length > 1;
  return geocoded.map((h) => {
    const addr = [h.street, [h.postal, h.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return {
      name: multi && (h.city || h.name) ? `${club.name} — ${h.city || h.name}` : club.name,
      address: addr || null,
      indoor: true, // un club FFTT = une salle/gymnase
      lat: Number(h.lat.toFixed(6)),
      lng: Number(h.lng.toFixed(6)),
      source: 'fftt',
    };
  });
}

async function main() {
  const byNumero = new Map(); // dédup club (une salle limitrophe peut sortir dans 2 départements)
  for (let i = 0; i < DEPTS.length; i++) {
    const dep = DEPTS[i];
    try {
      const raw = await fetchDept(dep);
      const clubs = extractClubs(raw);
      for (const c of clubs) {
        const key = c.numero || `_${c.name}`;
        if (!byNumero.has(key)) byNumero.set(key, c);
      }
      console.log(`[${i + 1}/${DEPTS.length}] dept ${dep} → ${clubs.length} clubs`);
    } catch (e) {
      console.log(`[${i + 1}/${DEPTS.length}] dept ${dep} ÉCHEC: ${e.message}`);
    }
    await sleep(1000); // poli
  }

  const venues = [...byNumero.values()].flatMap(clubToVenues);
  console.log(`\nclubs uniques: ${byNumero.size} | salles géocodées (venues): ${venues.length}`);

  if (DRY) {
    console.log('\n--- échantillon (5) ---');
    console.log(JSON.stringify(venues.slice(0, 5), null, 2));
    console.log('\n[dry] aucune écriture.');
    return;
  }

  // Purge des anciens clubs FFTT puis insert par lots.
  const del = await fetch(`${BASE}/rest/v1/venues?source=eq.fftt`, { method: 'DELETE', headers: H });
  if (!del.ok) throw new Error(`delete fftt ${del.status}: ${await del.text()}`);
  console.log(`anciens clubs FFTT supprimés (HTTP ${del.status})`);

  let inserted = 0;
  for (let i = 0; i < venues.length; i += 300) {
    const slice = venues.slice(i, i + 300);
    const r = await fetch(`${BASE}/rest/v1/venues`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(slice),
    });
    if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
    inserted += slice.length;
  }
  const cnt = await fetch(`${BASE}/rest/v1/venues?select=id&source=eq.fftt`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const total = cnt.headers.get('content-range')?.split('/')?.[1] ?? '?';
  console.log(`inséré: ${inserted} | venues source=fftt en base: ${total}`);
  console.log('FFTT_CLUBS_OK');
}

main().catch((e) => {
  console.error('SCRAPE_ERROR:', e.message);
  process.exit(1);
});
