// Seed joueurs de démo (auth users confirmés + lignes players).
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/seed-demo.mjs
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!SVC || !BASE) {
  console.error('SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL requis');
  process.exit(2);
}
const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const LEVELS = [
  ['legend', 2100], ['elite', 1900], ['master', 1700],
  ['expert', 1500], ['confirme', 1300], ['amateur', 1100], ['rookie', 0],
];
const levelFor = (elo) => (LEVELS.find(([, min]) => elo >= min) ?? LEVELS[LEVELS.length - 1])[0];

const demos = [
  { email: 'wei@demo.pingpang.paris', name: 'Wei Z.', city: 'Shanghai', elo: 2340 },
  { email: 'lucas@demo.pingpang.paris', name: 'Lucas M.', city: 'Paris', elo: 2180 },
  { email: 'ana@demo.pingpang.paris', name: 'Ana S.', city: 'Madrid', elo: 2050 },
  { email: 'emma@demo.pingpang.paris', name: 'Emma T.', city: 'Berlin', elo: 1740 },
  { email: 'yuki@demo.pingpang.paris', name: 'Yuki K.', city: 'Tokyo', elo: 1690 },
  { email: 'maxime@demo.pingpang.paris', name: 'Maxime L.', city: 'Paris 11e', elo: 1320 },
  { email: 'thomas@demo.pingpang.paris', name: 'Thomas D.', city: 'Paris', elo: 1240 },
];

async function ensureUser(email, name) {
  const r = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email, password: 'DemoPPP2026!', email_confirm: true, user_metadata: { display_name: name } }),
  });
  if (r.ok) return (await r.json()).id;
  const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=500`, { headers: h }).then((x) => x.json());
  return (list.users || []).find((u) => u.email === email)?.id ?? null;
}

const rows = [];
for (const d of demos) {
  const id = await ensureUser(d.email, d.name);
  if (!id) {
    console.log('SKIP (no id):', d.email);
    continue;
  }
  rows.push({ id, handle: d.email.split('@')[0], display_name: d.name, city: d.city, elo: d.elo, level: levelFor(d.elo) });
}

const up = await fetch(`${BASE}/rest/v1/players`, {
  method: 'POST',
  headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(rows),
});
const body = await up.json();
console.log('players upsert HTTP', up.status, '→', Array.isArray(body) ? body.length + ' rows' : JSON.stringify(body).slice(0, 200));
