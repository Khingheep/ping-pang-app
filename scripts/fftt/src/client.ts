/**
 * Client de recherche FFTT — orchestration session + requête + parsing.
 */

import { BASE, baseHeaders, createSession, type Session, type CreateSessionOptions } from './session.ts';
import { parsePlayerList } from './parse.ts';
import { getPlayerDetail, type FfttPlayerDetail } from './player.ts';
import type { FfttPlayer, SearchParams, Sexe } from './types.ts';

const AJAX_URL = `${BASE}/site/ajax1?plugins_controller=personsRemoteClassement&plugins_action=plugin_index_ajax`;
const CLASSEMENT_URL = `${BASE}/site/competition/classement/classement-national`;

/**
 * Clé de pagination du plugin classement. Constante observée et stable entre
 * sessions (ce n'est pas un jeton CSRF par session). Surchargeable au besoin.
 */
const PAGINATION_KEY = '2101138195';

function buildBody(p: SearchParams, sexe: Sexe): string {
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

async function searchOneSexe(
  session: Session,
  params: SearchParams,
  sexe: Sexe,
): Promise<FfttPlayer[]> {
  const res = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      ...baseHeaders(session.phpsessid),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE,
      referer: CLASSEMENT_URL,
    },
    body: buildBody(params, sexe),
  });
  if (res.status !== 200) {
    throw new Error(`FFTT: recherche HTTP ${res.status}`);
  }
  const html = await res.text();
  if (html.includes('Validation CAPTCHA')) {
    throw new Error('FFTT: session invalidée (CAPTCHA réapparu).');
  }
  return parsePlayerList(html, sexe === 'Hommes' ? 'H' : 'F');
}

/**
 * Client FFTT réutilisable : crée/valide la session une fois, puis enchaîne
 * les recherches.
 */
export class FfttClient {
  private constructor(private readonly session: Session) {}

  static async create(opts: CreateSessionOptions = {}): Promise<FfttClient> {
    const session = await createSession(opts);
    return new FfttClient(session);
  }

  get phpsessid(): string {
    return this.session.phpsessid;
  }

  /**
   * Recherche des joueurs. Si `sexe` n'est pas précisé, interroge Hommes puis
   * Femmes et fusionne (dé-doublonnage par numberId).
   */
  async search(params: SearchParams): Promise<FfttPlayer[]> {
    const sexes: Sexe[] = params.sexe ? [params.sexe] : ['Hommes', 'Femmes'];
    const seen = new Set<string>();
    const out: FfttPlayer[] = [];
    for (const sexe of sexes) {
      for (const player of await searchOneSexe(this.session, params, sexe)) {
        if (seen.has(player.numberId)) continue;
        seen.add(player.numberId);
        out.push(player);
      }
    }
    return out;
  }

  /**
   * Fiche détaillée d'un joueur (profil + historique des matchs) par son
   * numberId (= numéro de licence FFTT, renvoyé par `search`).
   */
  async getDetail(numberId: string, opts: { maxMatches?: number } = {}): Promise<FfttPlayerDetail> {
    return getPlayerDetail(this.session, numberId, opts);
  }
}
