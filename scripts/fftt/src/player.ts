/**
 * Fiche joueur détaillée FFTT — profil + historique des matchs.
 *
 * Deux requêtes enchaînées (la 2e dépend de la 1re) :
 *   1. GET  /site/personnes/by-number?number_id=ID
 *      → widgets de stats (.stats-cols) + le `pagination_key` du plugin matchs
 *        (régénéré à CHAQUE chargement de page : il faut le lire ici même).
 *   2. POST /site/ajax1?plugins_controller=personsRemoteGames&…
 *      avec `persons_licence=ID` + ce `pagination_key` + un `pagination-order`
 *      VALIDE (ex. "date DESC", sinon le serveur renvoie une erreur SQL 500).
 *      → liste HTML des matchs.
 */

import * as cheerio from 'cheerio';
import { BASE, baseHeaders, type Session } from './session.ts';

const BY_NUMBER = (id: string) => `${BASE}/site/personnes/by-number?number_id=${id}`;
const AJAX_GAMES = `${BASE}/site/ajax1?plugins_controller=personsRemoteGames&plugins_action=plugin_index_ajax`;

export interface FfttMatch {
  /** Date au format FFTT "JJ/MM/AA". */
  date: string;
  /** true = victoire, false = défaite, null si indéterminé. */
  victoire: boolean | null;
  adversaire: {
    numberId: string | null;
    nom: string;
    /** Classement officiel de l'adversaire ("N26", "12"…). */
    classement: string | null;
  };
  journee: number | null;
  coefficient: number | null;
  /** Points gagnés/perdus sur ce match. */
  gainPerte: number | null;
}

export interface FfttPlayerDetail {
  numberId: string;
  /** Classement mensuel ("N1", "12"…). */
  classementMensuel: string | null;
  pointsMensuels: number | null;
  /** Points officiels — valeur de force canonique. */
  pointsOfficiels: number | null;
  partiesDisputees: number | null;
  pctVictoires: number | null;
  pctDefaites: number | null;
  evolutionMois: number | null;
  evolutionAnnee: number | null;
  matchs: FfttMatch[];
}

/** Parse lâche : extrait un nombre même avec unité/suffixe ("100,00%", "-4 419 pts"). */
function looseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[   ]/g, '')
    .replace(/[^\d.,-]/g, '')
    .replace(',', '.');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function idFromHref(href: string | undefined): string | null {
  const m = href?.match(/number_id=(\d+)/);
  return m ? m[1] : null;
}

/** Mappe les widgets .stats-cols (libellé → clé du modèle). */
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
    if (key === 'classementMensuel') {
      out.classementMensuel = value || null;
    } else {
      (out as Record<string, number | null>)[key] = looseNum(value);
    }
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
    if (cols.length < 7) return; // entête ou ligne incomplète

    const date = $(cols[0]).text().replace(/\s+/g, ' ').trim();
    if (!/\d{2}\/\d{2}\/\d{2}/.test(date)) return; // saute l'entête

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
  session: Session,
  numberId: string,
  paginationKey: string,
  limit: number,
): Promise<FfttMatch[]> {
  const body = new URLSearchParams({
    'pagination-current': '1',
    'pagination-total': '1',
    'pagination-items': String(limit),
    'pagination-order': 'date DESC',
    competitions_id: 'all',
    source: 'page',
    'pagination-items-total': String(limit),
    persons_licence: numberId,
    pagination_key: paginationKey,
  }).toString();

  const res = await fetch(AJAX_GAMES, {
    method: 'POST',
    headers: {
      ...baseHeaders(session.phpsessid),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE,
      referer: BY_NUMBER(numberId),
    },
    body,
  });
  if (res.status !== 200) return []; // matchs indisponibles → profil quand même utile
  return parseMatches(await res.text());
}

/**
 * Récupère la fiche détaillée d'un joueur par son numberId (= numéro de licence).
 * @param maxMatches nombre max de matchs récupérés (défaut 50).
 */
export async function getPlayerDetail(
  session: Session,
  numberId: string,
  opts: { maxMatches?: number } = {},
): Promise<FfttPlayerDetail> {
  const res = await fetch(BY_NUMBER(numberId), { headers: baseHeaders(session.phpsessid) });
  const page = await res.text();
  if (page.includes('Validation CAPTCHA')) {
    throw new Error('FFTT: session invalidée (CAPTCHA réapparu).');
  }

  const $ = cheerio.load(page);
  const stats = parseStats($);
  const paginationKey = page.match(/ajax-filter-form(\d+)/)?.[1] ?? null;
  const matchs = paginationKey
    ? await fetchMatches(session, numberId, paginationKey, opts.maxMatches ?? 50)
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
