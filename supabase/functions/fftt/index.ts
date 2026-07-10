/**
 * Edge Function `fftt` — lookup joueurs FFTT pour l'app Ping Pang Paris.
 *
 * Endpoints (GET query ou POST JSON — compatible supabase.functions.invoke) :
 *   action=search  &nom=&prenom=&licence=&club=&nclub=&sexe=Hommes|Femmes
 *                  &type=cl|off &limit=  → { players: FfttPlayer[] }
 *   action=player  &numberId=            → { player: FfttPlayerDetail }
 *
 * Backend FFTT : API publique PingPocket (`pingpocket.ts`) — stateless, sans
 * CAPTCHA ni PHPSESSID. Solution temporaire en attendant l'accès officiel
 * SMARTPING. L'ancien scraper www2.fftt.com reste disponible dans `fftt.ts`
 * (réimporter depuis là pour repasser dessus). La table `fftt_session` et le
 * script `refresh-session` sont donc dormants tant que PingPocket est utilisé.
 *
 * PingPocket throttle les requêtes (429) → on renvoie 503 `rate_limited` et on
 * s'appuie sur le cache `fftt_cache` (TTL ci-dessous) pour ne pas le marteler.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FfttMatch, FfttPlayerDetail, SearchParams, Sexe } from './fftt.ts';
// Backend FFTT temporaire : API publique PingPocket (stateless, sans CAPTCHA).
// Pour repasser au scraper www2.fftt.com, réimporter depuis './fftt.ts'.
import {
  searchFftt,
  getDetailFftt,
  getHistoryFftt,
  getCommonOpponentsFftt,
  RateLimitedError,
} from './pingpocket.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/** TTL du cache par type de requête (secondes). */
const TTL = { search: 3600, player: 21600, history: 86400, common: 21600 } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Fusionne les paramètres venant de la query string et d'un corps JSON. */
async function readParams(req: Request, url: URL): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams) params[k] = v;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) {
          if (v != null) params[k] = String(v);
        }
      }
    } catch {
      // pas de corps JSON → on garde la query
    }
  }
  return params;
}

async function readCache(supabase: SupabaseClient, key: string, ttl: number): Promise<unknown | null> {
  const { data } = await supabase
    .from('fftt_cache')
    .select('payload, fetched_at')
    .eq('cache_key', key)
    .maybeSingle();
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.fetched_at as string).getTime();
  if (ageMs > ttl * 1000) return null;
  return data.payload;
}

async function writeCache(supabase: SupabaseClient, key: string, payload: unknown): Promise<void> {
  await supabase
    .from('fftt_cache')
    .upsert({ cache_key: key, payload, fetched_at: new Date().toISOString() });
}

/** "JJ/MM/AA" → "20AA-MM-JJ" (ISO), ou null si le format ne colle pas. */
function isoFromFfttDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  return `20${yy}-${mm}-${dd}`;
}

/** Clé naturelle idempotente d'un match (cf. commentaire migration 0020). */
function matchUid(playerId: string, m: FfttMatch): string {
  const iso = isoFromFfttDate(m.date) ?? m.date;
  const adv = m.adversaire.numberId ?? m.adversaire.nom.replace(/\s+/g, '_');
  return `${playerId}:${iso}:${adv}:${m.journee ?? 'x'}`;
}

/** Persiste l'historique des matchs d'un joueur — best-effort, upsert idempotent. */
async function upsertMatches(
  supabase: SupabaseClient,
  playerId: string,
  matchs: FfttMatch[],
): Promise<void> {
  if (!matchs.length) return;
  const now = new Date().toISOString();

  // Certains formats (tournoi, FF2, critérium fédéral) font jouer DEUX fois le
  // même adversaire le même jour (journée 0) → la clé naturelle
  // `player:date:adversaire:journée` entre en collision. Or un upsert dont le
  // batch contient des `match_uid` dupliqués échoue EN BLOC côté Postgres
  // (« ON CONFLICT DO UPDATE cannot affect row a second time ») → 0 match écrit.
  // On désambiguïse les seules clés en collision avec l'id PingPocket du match
  // (unique) — ou, à défaut (matchId null sur le flux live), l'index d'occurrence
  // dans la journée — puis on déduplique le batch par clé finale (garde-fou ultime).
  const bases = matchs.map((m) => matchUid(playerId, m));
  const collision = new Set<string>();
  const once = new Set<string>();
  for (const b of bases) (once.has(b) ? collision : once).add(b);

  const rows = new Map<string, Record<string, unknown>>();
  const occ = new Map<string, number>(); // index d'occurrence par clé en collision (fallback si matchId absent)
  matchs.forEach((m, i) => {
    const base = bases[i];
    // Clé stable par défaut ; en collision on désambiguïse par matchId (id PingPocket,
    // stable) s'il existe, sinon par l'index d'occurrence dans la journée — pour ne
    // JAMAIS perdre un match faute de matchId (null en live).
    let uid = base;
    if (collision.has(base)) {
      const n = (occ.get(base) ?? 0) + 1;
      occ.set(base, n);
      uid = m.matchId ? `${base}:${m.matchId}` : `${base}#${n}`;
    }
    rows.set(uid, {
      match_uid: uid,
      player_number_id: playerId,
      match_date: isoFromFfttDate(m.date),
      match_date_raw: m.date,
      victoire: m.victoire,
      adversaire_number_id: m.adversaire.numberId,
      adversaire_nom: m.adversaire.nom,
      adversaire_classement: m.adversaire.classement,
      journee: m.journee,
      coefficient: m.coefficient,
      gain_perte: m.gainPerte,
      competition_nom: m.competition?.nom ?? null,
      competition_sigle: m.competition?.sigle ?? null,
      point_accuracy: m.pointAccuracy ?? null,
      synced_at: now,
    });
  });

  await supabase.from('fftt_matches').upsert([...rows.values()], { onConflict: 'match_uid' });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const p = await readParams(req, url);
    const action = p.action ?? 'search';

    if (action === 'search') {
      const params: SearchParams = {
        nom: p.nom,
        prenom: p.prenom,
        licence: p.licence,
        club: p.club,
        nclub: p.nclub,
        sexe: p.sexe as Sexe | undefined,
        classementType: p.type as 'cl' | 'off' | undefined,
        categorie: p.categorie,
        limit: p.limit ? Number(p.limit) : undefined,
      };
      const key = `search:${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
      ).toString()}`;

      const cached = await readCache(supabase, key, TTL.search);
      if (cached) return json({ players: cached, cached: true });

      const players = await searchFftt(null, params);
      await writeCache(supabase, key, players);

      // Alimente le miroir local `fftt_players` (typeahead) — best-effort :
      // une écriture miroir qui échoue ne doit jamais casser la recherche.
      if (players.length) {
        try {
          await supabase.from('fftt_players').upsert(
            players.map((pl) => ({
              number_id: pl.numberId,
              nom: pl.nom,
              prenom: pl.prenom,
              club_nom: pl.club?.nom ?? null,
              sexe: pl.sexe,
              classement: pl.classementOfficiel,
              points_off: pl.pointsOfficiels,
              points_men: pl.pointsMensuels,
              points_rt: pl.pointsTempsReel ?? null,
              points_debut: pl.pointsDebutSaison ?? null,
              rang_national: pl.rangNational,
              categorie: pl.categorie,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'number_id' },
          );
        } catch (e) {
          console.error('[fftt] upsert fftt_players échoué (ignoré):', e);
        }
      }

      return json({ players });
    }

    if (action === 'player') {
      const numberId = p.numberId ?? p.licence;
      if (!numberId) return json({ error: 'numberId requis' }, 400);

      const key = `player:${numberId}`;
      const cached = (await readCache(supabase, key, TTL.player)) as FfttPlayerDetail | null;
      const player = cached ?? (await getDetailFftt(null, numberId));
      if (!cached) await writeCache(supabase, key, player);

      // Persiste l'historique des matchs — best-effort, INDÉPENDANT du cache
      // profil : on (ré)assure la persistance même sur un cache HIT, ce qui
      // auto-répare un import antérieur raté (upsert idempotent).
      try {
        await upsertMatches(supabase, numberId, player.matchs ?? []);
        // ELO Paul (migration 0059) : applique les matchs FFTT non traités à
        // l'ELO app du joueur lié, poids 1.2 — no-op si personne n'est lié à
        // cette licence. Idempotent (flag elo_applied par match).
        const { error: applyErr } = await supabase.rpc('apply_fftt_matches', { p_number_id: numberId });
        if (applyErr) console.error('[fftt] apply_fftt_matches échoué (ignoré):', applyErr);
      } catch (e) {
        console.error('[fftt] upsert fftt_matches échoué (ignoré):', e);
      }
      return json({ player, cached: !!cached });
    }

    if (action === 'history') {
      const numberId = p.numberId ?? p.licence;
      if (!numberId) return json({ error: 'numberId requis' }, 400);

      const key = `history:${numberId}`;
      const cached = await readCache(supabase, key, TTL.history);
      if (cached) return json({ history: cached, cached: true });

      const history = await getHistoryFftt(null, numberId);
      await writeCache(supabase, key, history);
      return json({ history });
    }

    if (action === 'common') {
      const a = p.numberId ?? p.licence;
      const b = p.opponentId ?? p.opponent;
      if (!a || !b) return json({ error: 'numberId et opponentId requis' }, 400);

      const key = `common:${[a, b].sort().join('-')}`;
      const cached = await readCache(supabase, key, TTL.common);
      if (cached) return json({ common: cached, cached: true });

      const common = await getCommonOpponentsFftt(null, a, b);
      await writeCache(supabase, key, common);
      return json({ common });
    }

    return json({ error: `action inconnue: ${action}` }, 400);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return json({ error: 'rate_limited', hint: 'PingPocket throttle (429), réessaie dans un instant.' }, 503);
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
