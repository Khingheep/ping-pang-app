// Seed lieux (venues) Ping Pang Paris.
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/seed-venues.mjs
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!SVC || !BASE) {
  console.error('SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL requis');
  process.exit(2);
}
const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const venues = [
  { name: 'Ping Pang Paris — Le Marais', address: '12 rue des Archives, 75004 Paris', lat: 48.8579, lng: 2.3553, indoor: true, source: 'manuel' },
  { name: 'Square du Temple', address: 'Square du Temple, 75003 Paris', lat: 48.8657, lng: 2.3614, indoor: false, source: 'manuel' },
  { name: 'Gymnase Japy', address: '2 rue Japy, 75011 Paris', lat: 48.8553, lng: 2.3793, indoor: true, source: 'manuel' },
  { name: 'Parc de la Villette', address: '211 av Jean Jaurès, 75019 Paris', lat: 48.8938, lng: 2.3897, indoor: false, source: 'manuel' },
  { name: 'Tennis2Table — Bastille', address: '15 bd Richard Lenoir, 75011 Paris', lat: 48.8556, lng: 2.3699, indoor: true, source: 'manuel' },
];

// Venues (name not unique in schema; just insert if table empty)
const existing = await fetch(`${BASE}/rest/v1/venues?select=id,name`, { headers: h }).then((r) => r.json());
if (Array.isArray(existing) && existing.length > 0) {
  console.log('venues already present:', existing.length);
} else {
  const r = await fetch(`${BASE}/rest/v1/venues`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(venues),
  });
  const body = await r.json();
  console.log('venues insert HTTP', r.status, '→', Array.isArray(body) ? body.length + ' rows' : JSON.stringify(body).slice(0, 200));
}
