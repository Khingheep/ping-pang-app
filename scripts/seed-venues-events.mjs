// Seed lieux (venues) + événements Ping Pang Paris (events_ppp).
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/seed-venues-events.mjs
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

async function upsert(path, rows, conflict) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...h, Prefer: `resolution=merge-duplicates,return=representation${conflict ? `` : ''}` },
    body: JSON.stringify(rows),
  });
  const body = await r.json();
  return { status: r.status, body };
}

// Venues (name not unique in schema; just insert if table empty)
const existing = await fetch(`${BASE}/rest/v1/venues?select=id,name`, { headers: h }).then((r) => r.json());
let venueIds = {};
if (Array.isArray(existing) && existing.length > 0) {
  existing.forEach((v) => (venueIds[v.name] = v.id));
  console.log('venues already present:', existing.length);
} else {
  const res = await upsert('venues', venues);
  console.log('venues insert HTTP', res.status, '→', Array.isArray(res.body) ? res.body.length + ' rows' : JSON.stringify(res.body).slice(0, 200));
  if (Array.isArray(res.body)) res.body.forEach((v) => (venueIds[v.name] = v.id));
}

const days = (n) => {
  // timestamps relatifs sans Date.now() interdit ? ici on est en Node, Date OK.
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
};

const events = [
  { external_id: 'ppp-tournoi-debutants', title: 'Tournoi Débutants', venue_id: venueIds['Ping Pang Paris — Le Marais'] ?? null, starts_at: days(3), spots_left: 8, url: 'https://pingpang.paris' },
  { external_id: 'ppp-soiree-libre', title: 'Soirée jeu libre', venue_id: venueIds['Gymnase Japy'] ?? null, starts_at: days(5), spots_left: 16, url: 'https://pingpang.paris' },
  { external_id: 'ppp-ladder-mensuel', title: 'Ladder mensuel', venue_id: venueIds['Tennis2Table — Bastille'] ?? null, starts_at: days(9), spots_left: 4, url: 'https://pingpang.paris' },
  { external_id: 'ppp-open-air', title: 'Open Air — La Villette', venue_id: venueIds['Parc de la Villette'] ?? null, starts_at: days(12), spots_left: 24, url: 'https://pingpang.paris' },
];

const er = await upsert('events_ppp', events);
console.log('events upsert HTTP', er.status, '→', Array.isArray(er.body) ? er.body.length + ' rows' : JSON.stringify(er.body).slice(0, 200));
