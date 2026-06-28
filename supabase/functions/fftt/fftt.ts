/**
 * Logique FFTT pour l'Edge Function (Deno).
 *
 * Port de la version Node validée (`scripts/fftt/src/`), SANS la résolution du
 * CAPTCHA : l'Edge Function consomme un PHPSESSID déjà validé (fourni par le
 * script Node `refresh-session`). Si le CAPTCHA réapparaît, on lève
 * `SessionExpiredError` → l'appelant renvoie un 503 et déclenche un refresh.
 */

import * as cheerio from 'cheerio';

const BASE = 'https://www2.fftt.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const AJAX_SEARCH = `${BASE}/site/ajax1?plugins_controller=personsRemoteClassement&plugins_action=plugin_index_ajax`;
const AJAX_GAMES = `${BASE}/site/ajax1?plugins_controller=personsRemoteGames&plugins_action=plugin_index_ajax`;
const CLASSEMENT_REF = `${BASE}/site/competition/classement/classement-national`;
const BY_NUMBER = (id: string) => `${BASE}/site/personnes/by-number?number_id=${id}`;

/** Clé de pagination du plugin classement — constante stable entre sessions. */
const PAGINATION_KEY = '2101138195';

export class SessionExpiredError extends Error {
  constructor() {
    super('SESSION_EXPIRED');
    this.name = 'SessionExpiredError';
  }
}

// ───────────────────────── Types ─────────────────────────

export type Sexe = 'Hommes' | 'Femmes';

export interface SearchParams {
  nom?: string;
  prenom?: string;
  licence?: string;
  club?: string;
  nclub?: string;
  sexe?: Sexe;
  classementType?: 'cl' | 'off';
  categorie?: string;
  limit?: number;
}

export interface FfttPlayer {
  numberId: string;
  nom: string;
  prenom: string;
  rangNational: number | null;
  pointsMensuels: number | null;
  classementOfficiel: string | null;
  pointsOfficiels: number | null;
  categorie: string | null;
  nationalite: string | null;
  sexe: 'H' | 'F';
  club: { numberId: string | null; nom: string } | null;
  // Champs additionnels (backend PingPocket). Optionnels : le scraper www2 ne les fournit pas.
  pointsTempsReel?: number | null; // force la plus à jour (intègre les matchs non encore officialisés)
  pointsDebutSaison?: number | null; // points officiels de début de phase
  pointsMensuelsPrecedents?: number | null; // points mensuels du mois précédent
}

export interface FfttMatch {
  date: string;
  victoire: boolean | null;
  adversaire: { numberId: string | null; nom: string; classement: string | null };
  journee: number | null;
  coefficient: number | null;
  gainPerte: number | null;
  // Backend PingPocket : compétition + fiabilité du calcul de points.
  competition?: { nom: string; sigle: string | null } | null;
  pointAccuracy?: string | null; // ex. "OFFICIAL"
}

export interface FfttPlayerDetail {
  numberId: string;
  classementMensuel: string | null;
  pointsMensuels: number | null;
  pointsOfficiels: number | null;
  partiesDisputees: number | null;
  pctVictoires: number | null;
  pctDefaites: number | null;
  evolutionMois: number | null;
  evolutionAnnee: number | null;
  matchs: FfttMatch[];
  // Champs additionnels (backend PingPocket).
  pointsTempsReel?: number | null;
  pointsDebutSaison?: number | null;
  pointsMensuelsPrecedents?: number | null;
}

// ───────────────────────── Helpers ─────────────────────────

function headers(phpsessid: string): Record<string, string> {
  return { 'user-agent': UA, cookie: `PHPSESSID=${phpsessid}` };
}

/** Nombre FFTT strict : rejette les cellules contenant des lettres ("4 NM"). */
function toNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const c = raw.replace(/ /g, '').replace(/\s/g, '').replace(',', '.');
  if (!c || /[a-z]/i.test(c)) return null;
  const n = Number.parseFloat(c);
  return Number.isNaN(n) ? null : n;
}

/** Nombre lâche : extrait la valeur même avec unité ("100,00%", "-4 419 pts"). */
function looseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const c = raw.replace(/[   ]/g, '').replace(/[^\d.,-]/g, '').replace(',', '.');
  if (!c) return null;
  const n = Number.parseFloat(c);
  return Number.isNaN(n) ? null : n;
}

function idFromHref(href: string | undefined): string | null {
  const m = href?.match(/number_id=(\d+)/);
  return m ? m[1] : null;
}

// ───────────────────────── Recherche ─────────────────────────

function buildSearchBody(p: SearchParams, sexe: Sexe): string {
  return new URLSearchParams({
    'pagination-current': '1',
    'pagination-total': '0',
    prem_value: '',
    classement_type: p.classementType ?? 'cl',
    persons_sexe: sexe,
    licence: p.licence ?? '',
    nom: p.nom ?? '',
    prenom: p.prenom ?? '',
    nclub: p.nclub ?? '',
    club: p.club ?? '',
    'pagination-items-total': '200',
    'pagination-order': 'CLGLOB ASC',
    categorie: p.categorie ?? 'all',
    'pagination-items': String(p.limit ?? 100),
    pagination_key: PAGINATION_KEY,
  }).toString();
}

function parsePlayerList(html: string, sexe: 'H' | 'F'): FfttPlayer[] {
  const $ = cheerio.load(html);
  const players: FfttPlayer[] = [];

  $('li.player-view').each((_, li) => {
    const $li = $(li);
    const personAnchor = $li.find('a[href*="personnes/by-number"]').first();
    const numberId = idFromHref(personAnchor.attr('href'));
    if (!numberId) return;

    const nom = personAnchor.text().trim().split('\n')[0].trim();
    const prenom = $li
      .find('.col-medium.desktop-display')
      .filter((__, el) => $(el).find('a').length === 0)
      .first()
      .text()
      .trim();

    const cols = $li.find('.col-small');
    const clubAnchor = $li.find('a[href*="structures/by-number"]').first();

    players.push({
      numberId,
      nom,
      prenom,
      rangNational: toNum(cols.eq(0).text()),
      pointsMensuels: toNum(cols.eq(1).text()),
      classementOfficiel: cols.eq(2).text().trim() || null,
      pointsOfficiels: toNum(cols.eq(3).text()),
      nationalite: cols.eq(4).text().replace(/ /g, '').trim() || null,
      categorie: cols.eq(5).text().trim() || null,
      sexe,
      club: clubAnchor.length
        ? { numberId: idFromHref(clubAnchor.attr('href')), nom: clubAnchor.text().trim() }
        : null,
    });
  });

  return players;
}

async function searchOneSexe(
  phpsessid: string,
  params: SearchParams,
  sexe: Sexe,
): Promise<FfttPlayer[]> {
  const res = await fetch(AJAX_SEARCH, {
    method: 'POST',
    headers: {
      ...headers(phpsessid),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE,
      referer: CLASSEMENT_REF,
    },
    body: buildSearchBody(params, sexe),
  });
  const html = await res.text();
  if (html.includes('Validation CAPTCHA')) throw new SessionExpiredError();
  return parsePlayerList(html, sexe === 'Hommes' ? 'H' : 'F');
}

/** Recherche de joueurs. Sexe non précisé → Hommes + Femmes fusionnés. */
export async function searchFftt(phpsessid: string, params: SearchParams): Promise<FfttPlayer[]> {
  const sexes: Sexe[] = params.sexe ? [params.sexe] : ['Hommes', 'Femmes'];
  const seen = new Set<string>();
  const out: FfttPlayer[] = [];
  for (const sexe of sexes) {
    for (const p of await searchOneSexe(phpsessid, params, sexe)) {
      if (seen.has(p.numberId)) continue;
      seen.add(p.numberId);
      out.push(p);
    }
  }
  return out;
}

// ───────────────────────── Fiche détaillée ─────────────────────────

const STAT_KEYS: Record<string, keyof FfttPlayerDetail> = {
  'classement mensuel': 'classementMensuel',
  'points mensuels': 'pointsMensuels',
  'points officiels': 'pointsOfficiels',
  'parties disputées': 'partiesDisputees',
  '% victoires': 'pctVictoires',
  '% défaites': 'pctDefaites',
  'evolution sur le mois': 'evolutionMois',
  "evolution sur l'année": 'evolutionAnnee',
};

function parseStats($: cheerio.CheerioAPI): Partial<FfttPlayerDetail> {
  const out: Partial<FfttPlayerDetail> = {};
  $('.stats-cols').each((_, el) => {
    const label = $(el).find('.stats-title').text().replace(/\s+/g, ' ').trim().toLowerCase();
    const value = $(el).find('.number').text().replace(/\s+/g, ' ').trim();
    const key = STAT_KEYS[label];
    if (!key) return;
    if (key === 'classementMensuel') out.classementMensuel = value || null;
    else (out as Record<string, number | null>)[key] = looseNum(value);
  });
  return out;
}

function parseMatches(html: string): FfttMatch[] {
  const $ = cheerio.load(html);
  const matchs: FfttMatch[] = [];

  $('ul.plugin-list-large > li').each((_, li) => {
    const cols = $(li)
      .find('.wrapper-row-flex-nowrap > div')
      .filter((__, el) => {
        const cls = $(el).attr('class') || '';
        return !cls.includes('mobile-display') && !cls.includes('clear');
      });
    if (cols.length < 7) return;

    const date = $(cols[0]).text().replace(/\s+/g, ' ').trim();
    if (!/\d{2}\/\d{2}\/\d{2}/.test(date)) return;

    const vd = $(cols[1]).text().trim().toUpperCase();
    const advAnchor = $(cols[2]).find('a').first();

    matchs.push({
      date,
      victoire: vd === 'V' ? true : vd === 'D' ? false : null,
      adversaire: {
        numberId: idFromHref(advAnchor.attr('href')),
        nom: advAnchor.text().replace(/\s+/g, ' ').trim(),
        classement: $(cols[3]).text().replace(/\s+/g, ' ').trim() || null,
      },
      journee: looseNum($(cols[4]).text()),
      coefficient: looseNum($(cols[5]).text()),
      gainPerte: looseNum($(cols[6]).text()),
    });
  });

  return matchs;
}

async function fetchMatches(
  phpsessid: string,
  numberId: string,
  paginationKey: string,
  limit: number,
): Promise<FfttMatch[]> {
  const body = new URLSearchParams({
    'pagination-current': '1',
    'pagination-total': '1',
    'pagination-items': String(limit),
    'pagination-order': 'date DESC', // obligatoire : vide → erreur SQL 500 côté FFTT
    competitions_id: 'all',
    source: 'page',
    'pagination-items-total': String(limit),
    persons_licence: numberId,
    pagination_key: paginationKey,
  }).toString();

  const res = await fetch(AJAX_GAMES, {
    method: 'POST',
    headers: {
      ...headers(phpsessid),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE,
      referer: BY_NUMBER(numberId),
    },
    body,
  });
  if (res.status !== 200) return [];
  return parseMatches(await res.text());
}

/** Fiche détaillée d'un joueur (profil + matchs) par son numberId. */
export async function getDetailFftt(
  phpsessid: string,
  numberId: string,
  maxMatches = 50,
): Promise<FfttPlayerDetail> {
  const res = await fetch(BY_NUMBER(numberId), { headers: headers(phpsessid) });
  const page = await res.text();
  if (page.includes('Validation CAPTCHA')) throw new SessionExpiredError();

  const $ = cheerio.load(page);
  const stats = parseStats($);
  const paginationKey = page.match(/ajax-filter-form(\d+)/)?.[1] ?? null;
  const matchs = paginationKey
    ? await fetchMatches(phpsessid, numberId, paginationKey, maxMatches)
    : [];

  return {
    numberId,
    classementMensuel: stats.classementMensuel ?? null,
    pointsMensuels: stats.pointsMensuels ?? null,
    pointsOfficiels: stats.pointsOfficiels ?? null,
    partiesDisputees: stats.partiesDisputees ?? null,
    pctVictoires: stats.pctVictoires ?? null,
    pctDefaites: stats.pctDefaites ?? null,
    evolutionMois: stats.evolutionMois ?? null,
    evolutionAnnee: stats.evolutionAnnee ?? null,
    matchs,
  };
}
