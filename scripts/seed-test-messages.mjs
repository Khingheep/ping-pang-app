// Test de la messagerie : crée le compte walid+test@gmail.com (prêt à l'emploi, onboardé)
// + son profil, puis fait envoyer des DM par plusieurs comptes démo vers ce compte.
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/seed-test-messages.mjs

const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!SVC || !BASE) {
  console.error('SUPABASE_SERVICE_ROLE + EXPO_PUBLIC_SUPABASE_URL requis');
  process.exit(2);
}
const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const TARGET_EMAIL = 'walid+test@gmail.com';
const TARGET_PASSWORD = 'Test1234!';

async function listUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
    if (!r.ok) throw new Error(`list ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const b = j.users ?? [];
    users.push(...b);
    if (b.length < 200) break;
    page += 1;
  }
  return users;
}

// 1) Compte cible (création si absent, sinon réutilisé).
const users = await listUsers();
let target = users.find((u) => (u.email ?? '').toLowerCase() === TARGET_EMAIL);
if (!target) {
  const r = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: TARGET_EMAIL, password: TARGET_PASSWORD, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`create user ${r.status}: ${await r.text()}`);
  target = await r.json();
  console.log(`✓ compte créé : ${TARGET_EMAIL} (mdp: ${TARGET_PASSWORD})`);
} else {
  console.log(`• compte déjà existant : ${TARGET_EMAIL}`);
}
const targetId = target.id;

// 2) Profil joueur cible (onboardé → l'app va directement au feed/messages).
{
  const r = await fetch(`${BASE}/rest/v1/players?on_conflict=id`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: targetId, handle: 'walidtest', display_name: 'Walid Test', city: 'Paris', onboarded: true }),
  });
  if (!r.ok) throw new Error(`upsert player cible ${r.status}: ${await r.text()}`);
}

// 3) Expéditeurs = comptes démo. On mappe email→id, puis on récupère leur display_name.
const demoUsers = users.filter((u) => /@demo\.pingpang\.paris$/.test(u.email ?? ''));
const byPrefix = (p) => demoUsers.find((u) => (u.email ?? '').startsWith(`${p}@`));
const conversations = [
  { sender: byPrefix('wei'), msgs: ['Salut Walid 👋', 'Bien joué hier soir, on remet ça vendredi ? 🏓'] },
  { sender: byPrefix('lucas'), msgs: ['Yo ! Tu viens au créneau de Japy demain 19h ?'] },
  { sender: byPrefix('ana'), msgs: ['Bienvenue sur Ping Pang 🎉', 'Dispo pour un match ce week-end si tu veux'] },
  { sender: byPrefix('maxime'), msgs: ['Prêt à perdre au prochain tournoi 😏 ?'] },
].filter((c) => c.sender);

// created_at étalés sur la dernière heure pour un ordre réaliste dans la liste.
let t = Date.now() - 60 * 60 * 1000;
const rows = [];
for (const c of conversations) {
  for (const body of c.msgs) {
    rows.push({ sender: c.sender.id, recipient: targetId, body, created_at: new Date(t).toISOString() });
    t += 5 * 60 * 1000; // +5 min entre chaque message
  }
}

const r = await fetch(`${BASE}/rest/v1/messages`, {
  method: 'POST',
  headers: { ...h, Prefer: 'return=minimal' },
  body: JSON.stringify(rows),
});
if (!r.ok) throw new Error(`insert messages ${r.status}: ${await r.text()}`);

console.log(`✓ ${rows.length} message(s) envoyés à ${TARGET_EMAIL} par ${conversations.length} joueur(s) :`);
for (const c of conversations) console.log(`   • ${c.sender.email.split('@')[0]} → ${c.msgs.length} msg`);
console.log(`\nConnecte-toi dans l'app avec ${TARGET_EMAIL} / ${TARGET_PASSWORD} → onglet Messages.`);
