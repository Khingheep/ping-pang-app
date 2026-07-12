/**
 * Helpers d'administration pour les tests e2e (contexte Node, jamais expose au navigateur).
 * Utilisent la service_role (scripts/fftt/.env) pour seeder/nettoyer les donnees du SEUL
 * compte de test, afin que chaque test soit auto-suffisant et se nettoie apres lui.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { E2E_EMAIL } from './creds';

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
    }
  } catch {
    /* absent : on retombe sur process.env */
  }
  return out;
}

const env = {
  ...loadEnv(resolve(process.cwd(), 'scripts/fftt/.env')),
  ...loadEnv(resolve(process.cwd(), '.env')),
};
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !SVC) throw new Error('admin e2e: URL Supabase ou service_role manquante (scripts/fftt/.env)');

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

let cachedId: string | null = null;

/** Id du joueur de test (retrouve par handle, mis en cache). */
export async function playerId(): Promise<string> {
  if (cachedId) return cachedId;
  const r = await fetch(`${BASE}/rest/v1/players?handle=eq.e2e-runner&select=id`, { headers: H });
  const rows = (await r.json()) as { id: string }[];
  if (!rows?.length) throw new Error(`admin e2e: joueur introuvable (${E2E_EMAIL})`);
  cachedId = rows[0].id;
  return cachedId;
}

/** Fixe l'objectif hebdo (minutes) ou null (defaut). */
export async function setGoal(min: number | null): Promise<void> {
  const id = await playerId();
  const r = await fetch(`${BASE}/rest/v1/players?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ weekly_goal_min: min }),
  });
  if (!r.ok) throw new Error(`setGoal: ${r.status} ${await r.text()}`);
}

export const resetGoal = () => setGoal(null);

/** Supprime toutes les seances d'entrainement du compte de test. */
export async function deleteSessions(): Promise<void> {
  const id = await playerId();
  const r = await fetch(`${BASE}/rest/v1/training_sessions?player_id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`deleteSessions: ${r.status} ${await r.text()}`);
}

/** Seed une seance (par defaut : cette semaine, via created_at=now cote serveur). */
export async function seedSession(p: { durationMin: number; strokes?: string[] }): Promise<void> {
  const id = await playerId();
  const r = await fetch(`${BASE}/rest/v1/training_sessions`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      player_id: id,
      duration_min: p.durationMin,
      strokes: p.strokes ?? ['Coup droit'],
      is_solo: true,
      photo_urls: [],
    }),
  });
  if (!r.ok) throw new Error(`seedSession: ${r.status} ${await r.text()}`);
}

/** Nombre de seances du compte de test (pour asserter les increments). */
export async function countSessions(): Promise<number> {
  const id = await playerId();
  const r = await fetch(`${BASE}/rest/v1/training_sessions?player_id=eq.${id}&select=id`, {
    headers: { ...H, Prefer: 'count=exact' },
  });
  const rows = (await r.json()) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}
