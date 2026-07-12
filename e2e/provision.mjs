/**
 * Provisionne le compte e2e (idempotent) avant les tests Playwright.
 *
 *   node e2e/provision.mjs
 *
 * Lit la service_role + l'URL Supabase depuis scripts/fftt/.env (jamais commité).
 * Cree/confirme un compte auth dedie aux tests + une ligne players ONBOARDEE, avec un
 * objectif hebdo remis à null (baseline 3h) pour que le test d'objectif parte propre.
 * N'affecte QUE ce compte de test, aucun vrai utilisateur.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Identifiants du compte e2e (doivent matcher e2e/creds.ts) ──
export const E2E_EMAIL = 'e2e-runner@pingpang.test';
export const E2E_PASSWORD = 'E2eRunner!2026';

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

async function ensureUser() {
  // Crée le compte (email confirmé + mot de passe connu). S'il existe déjà, on le retrouve
  // et on (re)met le mot de passe pour garantir un login déterministe.
  const create = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'E2E Runner' },
    }),
  });
  if (create.ok) return (await create.json()).id;

  const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=500`, { headers: h }).then((r) => r.json());
  const u = (list.users || []).find((x) => (x.email ?? '').toLowerCase() === E2E_EMAIL.toLowerCase());
  if (!u) throw new Error('Compte e2e introuvable et non créé.');
  const upd = await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ password: E2E_PASSWORD, email_confirm: true }),
  });
  if (!upd.ok) throw new Error(`MAJ mot de passe échouée: ${upd.status} ${await upd.text()}`);
  return u.id;
}

const id = await ensureUser();

// Ligne players ONBOARDÉE (sinon le RootNavigator redirige vers /onboarding), objectif hebdo
// remis à null → le hero affiche le défaut 3h, baseline propre pour le test.
const up = await fetch(`${BASE}/rest/v1/players`, {
  method: 'POST',
  headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify([
    {
      id,
      handle: 'e2e-runner',
      display_name: 'E2E Runner',
      city: 'Paris',
      elo: 1420,
      level: 'confirme',
      lat: 48.8566,
      lng: 2.3522,
      onboarded: true,
      weekly_goal_min: null,
    },
  ]),
});
const body = await up.json();
if (!up.ok) {
  console.error('✗ upsert players', up.status, JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

// Etat propre : on efface les seances d'entrainement du compte de test (les tests en
// creent/seedent puis nettoient, mais on repart d'une ardoise vide a chaque run).
const del = await fetch(`${BASE}/rest/v1/training_sessions?player_id=eq.${id}`, {
  method: 'DELETE',
  headers: { ...h, Prefer: 'return=minimal' },
});
if (!del.ok) console.warn('⚠ nettoyage training_sessions', del.status, await del.text());

console.log(`✓ compte e2e prêt: ${E2E_EMAIL} (id ${id}) — onboardé, objectif=null (3h), séances vidées`);
