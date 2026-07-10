/**
 * Backend FFTT via l'API publique de PingPocket (https://www.pingpocket.fr).
 *
 * Solution TEMPORAIRE en attendant l'accès officiel SMARTPING. Contrairement au
 * scraper www2.fftt.com (`fftt.ts`), PingPocket expose une vraie API JSON
 * **stateless** : aucun cookie, aucun CAPTCHA, aucun PHPSESSID à entretenir.
 *
 *   GET /app/fftt/api/licensees/{id}          → fiche joueur (JSON)
 *   GET /app/fftt/api/licensees/{id}/matches  → historique matchs (JSON)
 *   GET /app/fftt/licencies/form/resultats     → recherche par nom (HTML Wicket)
 *
 * On réémet exactement les mêmes types que `fftt.ts` (FfttPlayer /
 * FfttPlayerDetail) pour que l'Edge Function et le reste de l'app soient
 * inchangés. Seul point d'attention : PingPocket renvoie un 429 si on tape trop
 * vite → `RateLimitedError` (l'appelant doit s'appuyer sur le cache).
 */

import * as cheerio from 'cheerio';
import type { FfttPlayer, FfttPlayerDetail, FfttMatch, SearchParams } from './fftt.ts';

const BASE = 'https://www.pingpocket.fr';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const API_LICENSEE = (id: string) => `${BASE}/app/fftt/api/licensees/${id}`;
const API_MATCHES = (id: string) => `${BASE}/app/fftt/api/licensees/${id}/matches`;
const SEARCH = (nom: string, prenom: string) =>
  `${BASE}/app/fftt/licencies/form/resultats?NAME=${encodeURIComponent(nom)}` +
  `&FNAME=${encodeURIComponent(prenom)}&LICENSEE_ID=`;
const HISTORY_PAGE = (id: string) =>
  `${BASE}/app/fftt/licencies/${id}/graphiques/historique-classement`;

export class RateLimitedError extends Error {
  constructor() {
    super('RATE_LIMITED');
    this.name = 'RateLimitedError';
  }
}

// ───────────────────────── Types PingPocket ─────────────────────────

interface PPPoint {
  level: string;
  value: number;
  valueAsString: string;
}

interface PPLicensee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  club: { id: string; name: string } | null;
  gender: 'MAN' | 'WOMAN' | string;
  points: {
    firstStageOfficialPoints?: PPPoint;
    currentMonthlyPoints?: PPPoint;
    previousMonthlyPoints?: PPPoint;
    currentOfficialPoints?: PPPoint;
    realTimePoints?: PPPoint;
  };
  category: string | null;
}

interface PPMatch {
  id: string;
  opponent: { licensee: PPLicensee; matchPoints: number | null };
  isWon: boolean;
  points: number | null;
  date: { epoch: number; shortFormatDate: string };
  dayNumber: number | null;
  pointAccuracy: string | null;
  competition: { name: string; shortName: string; coefficient: number } | null;
}

// ───────────────────────── Helpers ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch PingPocket avec retry/backoff sur 429. La recherche (HTML Wicket) et,
 * dans une moindre mesure, l'API JSON sont rate-limitées PAR IP — or tous nos
 * utilisateurs partagent l'IP sortante de l'Edge Function. Un 429 transitoire
 * (collision entre deux recherches simultanées) se résout donc tout seul ici,
 * sans remonter d'erreur. Si ça persiste après les retries → l'appelant lève
 * `RateLimitedError`.
 */
async function ppFetch(url: string, accept: string): Promise<Response> {
  const h: Record<string, string> = {
    'user-agent': UA,
    accept,
    'x-requested-with': 'XMLHttpRequest',
    referer: `${BASE}/`,
  };
  const delays = [0, 700, 1500];
  let res!: Response;
  for (const d of delays) {
    if (d) await sleep(d);
    res = await fetch(url, { headers: h });
    if (res.status !== 429) return res;
  }
  return res; // toujours 429 après retries
}

const pts = (p: PPPoint | undefined): number | null => (p ? p.value : null);

const round = (n: number | null): number | null =>
  n == null ? null : Math.round(n * 100) / 100;

function sexeOf(gender: string): 'H' | 'F' {
  return gender === 'WOMAN' ? 'F' : 'H';
}

/** epoch ms → "JJ/MM/AA" en heure de Paris (format attendu par l'Edge Function). */
function ddmmyy(epoch: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(epoch));
}

async function getJson<T>(url: string): Promise<T> {
  const res = await ppFetch(url, 'application/json, text/javascript, */*');
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new Error(`PingPocket ${res.status} sur ${url}`);
  return (await res.json()) as T;
}

// ───────────────────────── Mapping → types FFTT ─────────────────────────

function toPlayer(l: PPLicensee): FfttPlayer {
  return {
    numberId: l.id,
    nom: l.lastName,
    prenom: l.firstName,
    rangNational: null, // non exposé par l'API PingPocket
    pointsMensuels: round(pts(l.points.currentMonthlyPoints)),
    classementOfficiel: null, // PingPocket donne des points, pas la lettre de classement
    pointsOfficiels: round(pts(l.points.currentOfficialPoints) ?? pts(l.points.firstStageOfficialPoints)),
    categorie: l.category,
    nationalite: null,
    sexe: sexeOf(l.gender),
    club: l.club ? { numberId: l.club.id, nom: l.club.name } : null,
    pointsTempsReel: round(pts(l.points.realTimePoints)),
    pointsDebutSaison: round(pts(l.points.firstStageOfficialPoints)),
    pointsMensuelsPrecedents: round(pts(l.points.previousMonthlyPoints)),
  };
}

function toMatch(m: PPMatch): FfttMatch {
  const opp = m.opponent.licensee;
  return {
    matchId: m.id ?? null,
    date: ddmmyy(m.date.epoch),
    victoire: m.isWon,
    adversaire: {
      numberId: opp.id || null,
      nom: opp.fullName,
      classement: null, // l'API ne donne pas le classement de l'adversaire ici
    },
    journee: m.dayNumber ?? null,
    coefficient: m.competition?.coefficient ?? null,
    gainPerte: m.points ?? null,
    competition: m.competition
      ? { nom: m.competition.name, sigle: m.competition.shortName ?? null }
      : null,
    pointAccuracy: m.pointAccuracy ?? null,
  };
}

// ───────────────────────── Recherche ─────────────────────────

/**
 * Sépare "GHEERAERT Paul" en { nom, prenom } : les tokens en MAJUSCULES de tête
 * forment le nom de famille (convention FFTT), le reste le prénom.
 */
function splitName(namePart: string): { nom: string; prenom: string } {
  const tokens = namePart.trim().split(/\s+/);
  const nom: string[] = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    const isUpper = t === t.toLocaleUpperCase('fr') && t !== t.toLocaleLowerCase('fr');
    if (!isUpper) break;
    nom.push(t);
  }
  // Garde-fou : si tout est majuscule (aucun prénom détecté), on garde le 1er token comme nom.
  if (i >= tokens.length) return { nom: tokens[0] ?? namePart, prenom: tokens.slice(1).join(' ') };
  return { nom: nom.join(' '), prenom: tokens.slice(i).join(' ') };
}

/** "N531" → 531 (rang national), sinon null. */
function rangFromCounter(counter: string): number | null {
  const m = counter.match(/^N\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Parse la page HTML Wicket de résultats. Deux layouts possibles :
 *  - liste multi-résultats : `ul.rounded > li > a.item-container`
 *  - résultat unique : un bloc `.licensee[data-title="NOM Prénom (CLUB)"]`
 */
function parseSearchHtml(html: string): FfttPlayer[] {
  const $ = cheerio.load(html);
  const out: FfttPlayer[] = [];
  const seen = new Set<string>();

  const push = (p: FfttPlayer) => {
    if (!p.numberId || seen.has(p.numberId)) return;
    seen.add(p.numberId);
    out.push(p);
  };

  // Layout liste. On n'accepte que les liens dont l'id de licence est le DERNIER
  // segment (`/licencies/123` ou `/licencies/123?...`) : sur une page profil
  // (résultat unique), les liens `item-container` pointent vers des sous-pages
  // (`/123/rangs`, `/123/stats`…) qu'il ne faut surtout pas prendre pour des joueurs.
  $('a.item-container[href*="licencies/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') ?? '';
    const id = href.match(/\/licencies\/(\d+)(?:\?|$)/)?.[1];
    if (!id) return;

    const namePart = $a.find('.labels p').first().text().trim();
    const clubName = $a.find('.labels em').first().text().trim();
    const clubId = href.match(/CLUB_ID=([^&]+)/)?.[1] ?? null;
    const counter = $a.find('small.counter').first().text().trim();
    const { nom, prenom } = splitName(namePart);

    push({
      numberId: id,
      nom,
      prenom,
      rangNational: rangFromCounter(counter),
      pointsMensuels: null,
      classementOfficiel: counter || null,
      pointsOfficiels: null,
      categorie: null,
      nationalite: null,
      sexe: 'H', // inconnu depuis la liste ; le détail (JSON) donne le vrai sexe
      club: clubName ? { numberId: clubId, nom: clubName } : null,
    });
  });

  if (out.length) return out;

  // Layout résultat unique.
  $('.licensee[data-title]').each((_, el) => {
    const $el = $(el);
    const title = ($el.attr('data-title') ?? '').trim();
    const id = ($el.html() ?? '').match(/licencies\/(\d+)/)?.[1];
    if (!title || !id) return;

    const m = title.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const { nom, prenom } = splitName(m ? m[1] : title);
    push({
      numberId: id,
      nom,
      prenom,
      rangNational: null,
      pointsMensuels: null,
      classementOfficiel: null,
      pointsOfficiels: null,
      categorie: null,
      nationalite: null,
      sexe: 'H',
      club: m && m[2].trim() ? { numberId: null, nom: m[2].trim() } : null,
    });
  });

  return out;
}

// ───────────────────────── API publique (même contrat que fftt.ts) ─────────────────────────

/**
 * Recherche de joueurs. Si une licence est fournie, on tape directement l'API
 * JSON (rapide et complet). Sinon on parse la page de résultats par nom/prénom.
 */
export async function searchFftt(_unused: unknown, params: SearchParams): Promise<FfttPlayer[]> {
  if (params.licence) {
    try {
      const l = await getJson<PPLicensee>(API_LICENSEE(params.licence));
      return [toPlayer(l)];
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      return []; // licence inexistante → 404/erreur → pas de résultat
    }
  }

  const res = await ppFetch(SEARCH(params.nom ?? '', params.prenom ?? ''), '*/*');
  if (res.status === 429) throw new RateLimitedError();
  const html = await res.text();

  // Le sexe n'étant pas exposé dans la liste HTML, on ne filtre pas dessus ici.
  return parseSearchHtml(html).slice(0, params.limit ?? 100);
}

/** Fiche détaillée d'un joueur (profil + matchs + stats calculées) par licence. */
export async function getDetailFftt(
  _unused: unknown,
  numberId: string,
  maxMatches = 200, // PingPocket renvoie tout l'historique de la saison (~70) → on garde tout
): Promise<FfttPlayerDetail> {
  const licensee = await getJson<PPLicensee>(API_LICENSEE(numberId));

  let matchs: FfttMatch[] = [];
  try {
    const raw = await getJson<PPMatch[]>(API_MATCHES(numberId));
    matchs = raw.map(toMatch).slice(0, maxMatches);
  } catch (err) {
    if (err instanceof RateLimitedError) throw err;
    // pas de matchs disponibles → on renvoie quand même le profil
  }

  const played = matchs.length;
  const wins = matchs.filter((m) => m.victoire === true).length;
  const monthly = pts(licensee.points.currentMonthlyPoints);
  const prevMonthly = pts(licensee.points.previousMonthlyPoints);

  return {
    numberId,
    classementMensuel: null,
    pointsMensuels: round(monthly),
    pointsOfficiels: round(
      pts(licensee.points.currentOfficialPoints) ?? pts(licensee.points.firstStageOfficialPoints),
    ),
    partiesDisputees: played || null,
    pctVictoires: played ? round((wins / played) * 100) : null,
    pctDefaites: played ? round(((played - wins) / played) * 100) : null,
    evolutionMois: monthly != null && prevMonthly != null ? round(monthly - prevMonthly) : null,
    evolutionAnnee: null,
    matchs,
    pointsTempsReel: round(pts(licensee.points.realTimePoints)),
    pointsDebutSaison: round(pts(licensee.points.firstStageOfficialPoints)),
    pointsMensuelsPrecedents: round(prevMonthly),
  };
}

// ───────────────────────── Historique de classement ─────────────────────────

export interface FfttRankingPoint {
  date: string; // ISO "YYYY-MM-DD"
  points: number; // points officiels à cette date
  nationalRanking: number | null;
}

/**
 * Historique officiel des points (depuis ~2012). PingPocket l'embarque dans la
 * page graphique Highcharts sous forme de points `{ x: Date.UTC(y,m,d), y, nationalRanking }`.
 * `Date.UTC` a le mois en base 0. On ne lit que la 1re série (le joueur).
 */
function parseHistory(html: string): FfttRankingPoint[] {
  const start = html.indexOf('data: [');
  if (start < 0) return [];
  const end = html.indexOf(']', start);
  const block = html.slice(start, end < 0 ? undefined : end);

  const re =
    /Date\.UTC\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*,\s*y:\s*([\d.]+)(?:\s*,\s*nationalRanking:\s*(\d+|null))?/g;
  const out: FfttRankingPoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const [, y, mo, d, pts, nr] = m;
    const iso = `${y}-${String(Number(mo) + 1).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    out.push({
      date: iso,
      points: Number(pts),
      nationalRanking: nr && nr !== 'null' ? Number(nr) : null,
    });
  }
  return out;
}

/** Historique de classement (tendance long terme) d'un joueur. */
export async function getHistoryFftt(_unused: unknown, numberId: string): Promise<FfttRankingPoint[]> {
  const res = await ppFetch(HISTORY_PAGE(numberId), '*/*');
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) return [];
  return parseHistory(await res.text());
}

// ───────────────────────── Adversaires communs ─────────────────────────

export interface FfttHeadToHead {
  opponent: { numberId: string; nom: string };
  a: { date: string; victoire: boolean; journee: number | null }[];
  b: { date: string; victoire: boolean; journee: number | null }[];
}

/**
 * Adversaires communs entre 2 joueurs : intersection de leurs historiques de
 * matchs (API JSON, pas de scraping). Pour chaque adversaire commun, on liste
 * les résultats de A et de B contre lui.
 */
export async function getCommonOpponentsFftt(
  _unused: unknown,
  idA: string,
  idB: string,
): Promise<FfttHeadToHead[]> {
  const [rawA, rawB] = await Promise.all([
    getJson<PPMatch[]>(API_MATCHES(idA)).catch((e) => {
      if (e instanceof RateLimitedError) throw e;
      return [] as PPMatch[];
    }),
    getJson<PPMatch[]>(API_MATCHES(idB)).catch((e) => {
      if (e instanceof RateLimitedError) throw e;
      return [] as PPMatch[];
    }),
  ]);

  const byOpp = (raw: PPMatch[]) => {
    const map = new Map<string, { nom: string; games: PPMatch[] }>();
    for (const m of raw) {
      const oid = m.opponent.licensee.id;
      if (!oid) continue;
      const e = map.get(oid) ?? { nom: m.opponent.licensee.fullName, games: [] };
      e.games.push(m);
      map.set(oid, e);
    }
    return map;
  };

  const a = byOpp(rawA);
  const b = byOpp(rawB);
  const toGames = (gs: PPMatch[]) =>
    gs.map((g) => ({ date: ddmmyy(g.date.epoch), victoire: g.isWon, journee: g.dayNumber ?? null }));

  const out: FfttHeadToHead[] = [];
  for (const [oid, ea] of a) {
    const eb = b.get(oid);
    if (!eb || oid === idA || oid === idB) continue;
    out.push({
      opponent: { numberId: oid, nom: ea.nom },
      a: toGames(ea.games),
      b: toGames(eb.games),
    });
  }
  return out;
}
