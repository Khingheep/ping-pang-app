/**
 * Helpers d'administration pour les tests e2e (contexte Node, jamais expose au navigateur).
 * Utilisent la service_role (scripts/fftt/.env) pour seeder/nettoyer les donnees du SEUL
 * compte de test, afin que chaque test soit auto-suffisant et se nettoie apres lui.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const cache: Record<string, string> = {};

/** Id d'un joueur de test retrouve par handle (mis en cache). */
async function idByHandle(handle: string): Promise<string> {
  if (cache[handle]) return cache[handle];
  const r = await fetch(`${BASE}/rest/v1/players?handle=eq.${handle}&select=id`, { headers: H });
  const rows = (await r.json()) as { id: string }[];
  if (!rows?.length) throw new Error(`admin e2e: joueur introuvable (${handle})`);
  cache[handle] = rows[0].id;
  return rows[0].id;
}

/** Id du compte pilote. */
export const playerId = () => idByHandle('e2e-runner');
/** Id du compte pair (destinataire de messages, adversaire de match). */
export const peerId = () => idByHandle('e2e-peer');

/** Id d'un lieu quelconque (pour proposer un creneau). */
export async function anyVenueId(): Promise<string> {
  if (cache.venue) return cache.venue;
  const r = await fetch(`${BASE}/rest/v1/venues?select=id&limit=1`, { headers: H });
  const rows = (await r.json()) as { id: string }[];
  if (!rows?.length) throw new Error('admin e2e: aucun lieu en base');
  cache.venue = rows[0].id;
  return rows[0].id;
}

async function count(path: string): Promise<number> {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  const rows = (await r.json()) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}

async function del(path: string): Promise<void> {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  if (!r.ok) throw new Error(`admin del ${path}: ${r.status} ${await r.text()}`);
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
  await del(`training_sessions?player_id=eq.${await playerId()}`);
}

/** Supprime tous les creneaux proposes par le compte de test. */
export async function deleteSlots(): Promise<void> {
  await del(`slots?host_id=eq.${await playerId()}`);
}

/** Nombre de creneaux proposes par le compte de test. */
export async function countSlots(): Promise<number> {
  return count(`slots?host_id=eq.${await playerId()}&select=id`);
}

/** Supprime les tournois crees par le compte de test (+ inscriptions). */
export async function deleteTournaments(): Promise<void> {
  const id = await playerId();
  const rows = (await (await fetch(`${BASE}/rest/v1/tournaments?owner_id=eq.${id}&select=id`, { headers: H })).json()) as { id: string }[];
  for (const t of Array.isArray(rows) ? rows : []) await del(`tournament_players?tournament_id=eq.${t.id}`);
  await del(`tournament_players?player_id=eq.${id}`);
  await del(`tournaments?owner_id=eq.${id}`);
}

/** Nombre de tournois crees par le compte de test. */
export async function countTournaments(): Promise<number> {
  return count(`tournaments?owner_id=eq.${await playerId()}&select=id`);
}

/** Supprime les messages envoyes/recus par le compte de test. */
export async function deleteMessages(): Promise<void> {
  const id = await playerId();
  await del(`messages?sender=eq.${id}`);
  await del(`messages?recipient=eq.${id}`);
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

/** Seed une seance et renvoie son id (pour naviguer directement dessus). */
export async function seedSessionId(p: { durationMin: number; strokes?: string[] }): Promise<string> {
  const id = await playerId();
  const r = await fetch(`${BASE}/rest/v1/training_sessions`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ player_id: id, duration_min: p.durationMin, strokes: p.strokes ?? ['Coup droit'], is_solo: true, photo_urls: [] }),
  });
  if (!r.ok) throw new Error(`seedSessionId: ${r.status} ${await r.text()}`);
  const rows = (await r.json()) as { id: string }[];
  return rows[0].id;
}

/** Nombre d'aces (likes) sur les commentaires d'une seance (join embarque). */
export async function sessionCommentAceCount(sessionId: string): Promise<number> {
  const r = await fetch(
    `${BASE}/rest/v1/session_comment_likes?select=comment_id,session_comments!inner(session_id)&session_comments.session_id=eq.${sessionId}`,
    { headers: H },
  );
  const rows = (await r.json()) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
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
