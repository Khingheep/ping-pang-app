/**
 * Provisionne les comptes e2e (idempotent) avant les tests Playwright.
 *
 *   node e2e/provision.mjs
 *
 * Lit la service_role + l'URL Supabase depuis scripts/fftt/.env (jamais commité).
 * Cree/confirme deux comptes auth dedies aux tests + leurs lignes players ONBOARDEES :
 *   - e2e-runner : le compte pilote (celui qui se connecte dans les tests)
 *   - e2e-peer   : un pair (destinataire des messages, futur adversaire de match)
 * Puis remet le compte pilote a plat (objectif=null, seances/creneaux/tournois/messages vides)
 * pour que chaque run parte d'une ardoise propre. N'affecte QUE ces comptes de test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Identifiants des comptes e2e (doivent matcher e2e/creds.ts) ──
export const E2E_EMAIL = 'e2e-runner@pingpang.test';
export const E2E_PASSWORD = 'E2eRunner!2026';
const PEER_EMAIL = 'e2e-peer@pingpang.test';

// ── Charge scripts/fftt/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) ──
function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
    }
  } catch {
    /* fichier absent : on retombera sur process.env */
  }
  return out;
}

const env = { ...loadEnv(resolve(__dirname, '../scripts/fftt/.env')), ...loadEnv(resolve(__dirname, '../.env')) };
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !SVC) {
  console.error('✗ URL Supabase ou service_role manquante (scripts/fftt/.env).');
  process.exit(2);
}

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

/** Cree (ou retrouve) un compte auth confirme avec mot de passe connu. Renvoie son id. */
async function ensureUser(email, displayName) {
  const create = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email, password: E2E_PASSWORD, email_confirm: true, user_metadata: { display_name: displayName } }),
  });
  if (create.ok) return (await create.json()).id;

  const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=500`, { headers: h }).then((r) => r.json());
  const u = (list.users || []).find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`Compte e2e introuvable et non cree : ${email}`);
  await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ password: E2E_PASSWORD, email_confirm: true }),
  });
  return u.id;
}

/** Upsert d'une ligne players ONBOARDEE (sinon le RootNavigator renvoie vers /onboarding). */
async function ensurePlayer(row) {
  const up = await fetch(`${BASE}/rest/v1/players`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  });
  if (!up.ok) throw new Error(`upsert players ${row.handle}: ${up.status} ${await up.text()}`);
}

const del = (path) => fetch(`${BASE}/rest/v1/${path}`, { method: 'DELETE', headers: { ...h, Prefer: 'return=minimal' } });

// ── Comptes ──
const runnerId = await ensureUser(E2E_EMAIL, 'E2E Runner');
const peerId = await ensureUser(PEER_EMAIL, 'E2E Peer');

await ensurePlayer({
  id: runnerId, handle: 'e2e-runner', display_name: 'E2E Runner', city: 'Paris',
  elo: 1420, level: 'confirme', lat: 48.8566, lng: 2.3522, onboarded: true, weekly_goal_min: null,
});
await ensurePlayer({
  id: peerId, handle: 'e2e-peer', display_name: 'E2E Peer', city: 'Paris',
  elo: 1380, level: 'confirme', lat: 48.86, lng: 2.35, onboarded: true,
});

// ── Ardoise propre pour le compte pilote (les tests seedent/creent puis nettoient, mais on
//    repart de zero a chaque run). Ordre : enfants avant parents pour les tournois. ──
const tRows = await fetch(`${BASE}/rest/v1/tournaments?owner_id=eq.${runnerId}&select=id`, { headers: h }).then((r) => r.json());
for (const t of Array.isArray(tRows) ? tRows : []) await del(`tournament_players?tournament_id=eq.${t.id}`);
await del(`tournament_players?player_id=eq.${runnerId}`);
await del(`tournaments?owner_id=eq.${runnerId}`);
await del(`training_sessions?player_id=eq.${runnerId}`);
await del(`slots?host_id=eq.${runnerId}`);
await del(`messages?sender=eq.${runnerId}`);
await del(`messages?recipient=eq.${runnerId}`);

console.log(`✓ comptes e2e prets: ${E2E_EMAIL} (${runnerId}) + ${PEER_EMAIL} (${peerId}) — onboardes, etat pilote remis a plat`);
