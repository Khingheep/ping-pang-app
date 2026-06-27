/**
 * Parsing du HTML de la liste classement FFTT (`personsRemoteClassement`).
 *
 * Chaque joueur est un `<li class="player-view">` contenant une rangée flex.
 * Colonnes (version desktop, dans l'ordre du DOM) :
 *   .col-small  ×4  → rang national, points mensuels, classement off., points off.
 *   .col-small (desktop) → nationalité
 *   .col-small  → catégorie
 *   a[personnes/by-number] → number_id + nom
 *   .col-medium (sans lien) → prénom
 *   a[structures/by-number] → number_id club + nom club
 */

import * as cheerio from 'cheerio';
import type { FfttPlayer } from './types.ts';

/** "1 699" / "1717,8" / "&nbsp;" → number | null (gère la virgule décimale FR). */
export function toNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/ /g, ' ')
    .replace(/\s/g, '')
    .replace(',', '.');
  // Rejette les cellules avec lettres (ex. "4 NM" des numérotés nationaux)
  // pour éviter de stocker un nombre tronqué erroné.
  if (!cleaned || /[a-z]/i.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function firstAttrId(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/number_id=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Parse une réponse HTML de recherche en liste de joueurs.
 * @param sexe sexe du filtre utilisé (non présent dans le HTML, injecté ici).
 */
export function parsePlayerList(html: string, sexe: 'H' | 'F'): FfttPlayer[] {
  const $ = cheerio.load(html);
  const players: FfttPlayer[] = [];

  $('li.player-view').each((_, li) => {
    const $li = $(li);

    const personAnchor = $li.find('a[href*="personnes/by-number"]').first();
    const numberId = firstAttrId(personAnchor.attr('href'));
    if (!numberId) return; // ligne sans lien joueur → on ignore

    // Le lien desktop ne contient que le nom (la variante mobile ajoute <br>prénom).
    const nom = personAnchor.text().trim().split('\n')[0].trim();

    // Prénom = la col-medium desktop sans lien.
    const prenom = $li
      .find('.col-medium.desktop-display')
      .filter((__, el) => $(el).find('a').length === 0)
      .first()
      .text()
      .trim();

    // Les 6 colonnes "petites" dans l'ordre.
    const cols = $li.find('.col-small');
    const rangNational = toNum(cols.eq(0).text());
    const pointsMensuels = toNum(cols.eq(1).text());
    const classementOfficiel = cols.eq(2).text().trim() || null;
    const pointsOfficiels = toNum(cols.eq(3).text());
    const nationalite = cols.eq(4).text().replace(/ /g, '').trim() || null;
    const categorie = cols.eq(5).text().trim() || null;

    const clubAnchor = $li.find('a[href*="structures/by-number"]').first();
    const club = clubAnchor.length
      ? { numberId: firstAttrId(clubAnchor.attr('href')), nom: clubAnchor.text().trim() }
      : null;

    players.push({
      numberId,
      nom,
      prenom,
      rangNational,
      pointsMensuels,
      classementOfficiel,
      pointsOfficiels,
      categorie,
      nationalite,
      sexe,
      club,
    });
  });

  return players;
}
