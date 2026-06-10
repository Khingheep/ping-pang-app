// Seed interactions de démo pour le compte dev (défi reçu, messages) → notifications auto.
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/seed-interactions.mjs
const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const get = (path) => fetch(`${BASE}/rest/v1/${path}`, { headers: h }).then((r) => r.json());
const post = (path, body) =>
  fetch(`${BASE}/rest/v1/${path}`, { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(body) }).then(
    async (r) => ({ status: r.status, body: await r.json() }),
  );

const players = await get('players?select=id,handle,display_name');
const byHandle = Object.fromEntries(players.map((p) => [p.handle, p]));
const dev = byHandle['dev'];
const thomas = byHandle['thomas'];
const maxime = byHandle['maxime'];
if (!dev || !thomas || !maxime) {
  console.error('joueurs requis manquants (dev/thomas/maxime)');
  process.exit(1);
}

// défi reçu (Thomas → dev) — déclenche une notification
const existingCh = await get(`challenges?select=id&to_player=eq.${dev.id}&from_player=eq.${thomas.id}`);
if (!existingCh.length) {
  const r = await post('challenges', { from_player: thomas.id, to_player: dev.id, message: 'On se fait une revanche ?', status: 'sent' });
  console.log('challenge seeded:', r.status);
} else console.log('challenge already present');

// conversation (Maxime <-> dev)
const existingMsg = await get(`messages?select=id&or=(sender.eq.${maxime.id},recipient.eq.${maxime.id})&limit=1`);
if (!existingMsg.length) {
  const r = await post('messages', [
    { sender: maxime.id, recipient: dev.id, body: 'Salut ! Dispo ce week-end ?' },
    { sender: dev.id, recipient: maxime.id, body: 'Yes, samedi aprem ça te va ?' },
    { sender: maxime.id, recipient: dev.id, body: 'Parfait, au Marais 14h 🏓' },
  ]);
  console.log('messages seeded:', r.status);
} else console.log('messages already present');

const notifs = await get(`notifications?select=type,title&player_id=eq.${dev.id}`);
console.log('notifications for dev:', notifs.length, notifs.map((n) => n.type).join(','));
