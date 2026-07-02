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

// lat/lng = vraie position : les joueurs parisiens apparaissent « près de toi » dans
// l'onglet Défis (tri par distance), les autres villes restent loin (démo réaliste).
const demos = [
  { email: 'wei@demo.pingpang.paris', name: 'Wei Z.', city: 'Shanghai', elo: 2340, lat: 31.2304, lng: 121.4737, bio: 'Élevé au revers chinois, pousse-bloc all-terrain. Je cherche des adversaires qui n\'ont pas peur du contre. 🏓' },
  { email: 'lucas@demo.pingpang.paris', name: 'Lucas M.', city: 'Paris', elo: 2180, lat: 48.8579, lng: 2.3553, bio: 'Attaquant deux ailes, dispo le soir au Marais. Toujours partant pour un set serré.' },
  { email: 'ana@demo.pingpang.paris', name: 'Ana S.', city: 'Madrid', elo: 2050, lat: 40.4168, lng: -3.7038, bio: 'Topspin coup droit et beaucoup de patience. Je joue pour le plaisir… et pour gagner.' },
  { email: 'emma@demo.pingpang.paris', name: 'Emma T.', city: 'Berlin', elo: 1740, lat: 52.52, lng: 13.405, bio: 'Défenseuse moderne, j\'aime ramener l\'imprenable. Café avant, ping après.' },
  { email: 'yuki@demo.pingpang.paris', name: 'Yuki K.', city: 'Tokyo', elo: 1690, lat: 35.6762, lng: 139.6503, bio: 'Service-relance et jeu court. Petite mais rapide — je cherche du jeu technique.' },
  { email: 'maxime@demo.pingpang.paris', name: 'Maxime L.', city: 'Paris 11e', elo: 1320, lat: 48.8589, lng: 2.3765, bio: 'Je débute sérieusement depuis un an, motivé à grimper. Ouvert à tous les conseils !' },
  { email: 'thomas@demo.pingpang.paris', name: 'Thomas D.', city: 'Paris', elo: 1240, lat: 48.853, lng: 2.37, bio: 'Joueur du dimanche qui se prend (un peu trop) au sérieux. On tape la balle ?' },
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
  rows.push({ id, handle: d.email.split('@')[0], display_name: d.name, city: d.city, bio: d.bio, elo: d.elo, level: levelFor(d.elo), lat: d.lat, lng: d.lng });
}

const up = await fetch(`${BASE}/rest/v1/players`, {
  method: 'POST',
  headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(rows),
});
const body = await up.json();
console.log('players upsert HTTP', up.status, '→', Array.isArray(body) ? body.length + ' rows' : JSON.stringify(body).slice(0, 200));
