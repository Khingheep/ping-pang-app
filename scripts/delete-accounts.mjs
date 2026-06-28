// Supprime les comptes auth dont l'email CONTIENT un motif (+ cascade players & données liées).
// ⚠️ DESTRUCTIF + PROD. Vérifie le motif avant de lancer.
//
// Usage (dry-run par défaut, n'efface rien, liste seulement) :
//   SUPABASE_SERVICE_ROLE=xxx EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
//     node scripts/delete-accounts.mjs walid.bouzidane
//
// Pour supprimer pour de vrai, ajoute --yes :
//   SUPABASE_SERVICE_ROLE=xxx EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
//     node scripts/delete-accounts.mjs walid.bouzidane --yes

const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const args = process.argv.slice(2);
const apply = args.includes('--yes');
const needle = (args.find((a) => !a.startsWith('--')) ?? '').toLowerCase();

if (!SVC || !BASE || !needle) {
  console.error(
    'Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/delete-accounts.mjs <motif-email> [--yes]',
  );
  process.exit(2);
}

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

async function listAllUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
    if (!r.ok) throw new Error(`list page ${page} → ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const batch = j.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
    page += 1;
  }
  return users;
}

const all = await listAllUsers();
const targets = all.filter((u) => (u.email ?? '').toLowerCase().includes(needle));

console.log(`Motif "${needle}" → ${targets.length} compte(s) ciblé(s) sur ${all.length} au total :`);
for (const u of targets) console.log(`  • ${u.email}  (${u.id})`);

if (!targets.length) {
  console.log('Rien à supprimer.');
  process.exit(0);
}
if (!apply) {
  console.log('\nDRY-RUN : rien supprimé. Relance avec --yes pour confirmer la suppression.');
  process.exit(0);
}

// Certaines FK vers players n'ont PAS de ON DELETE CASCADE (matches.winner,
// tournament_matches.player_a/_b/winner) → on les nettoie avant de supprimer le user.
async function clearRefs(playerId) {
  const rest = (path, method = 'DELETE', body) =>
    fetch(`${BASE}/rest/v1/${path}`, {
      method,
      headers: { ...h, Prefer: 'return=minimal' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  // Matchs de tournoi où le joueur apparaît (joueur A/B ou vainqueur).
  await rest(`tournament_matches?or=(player_a.eq.${playerId},player_b.eq.${playerId},winner.eq.${playerId})`);
  // Vainqueur de match classique (les matchs où il est participant partent en cascade).
  await rest(`matches?winner=eq.${playerId}`, 'PATCH', { winner: null });
}

let ok = 0;
for (const u of targets) {
  await clearRefs(u.id);
  const r = await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: h });
  if (r.ok) ok += 1;
  console.log(`${r.ok ? '✓' : `✗ ${r.status} ${await r.text()}`} ${u.email}`);
}
console.log(`\nTerminé : ${ok}/${targets.length} supprimé(s). Les lignes players + données liées partent en cascade.`);
