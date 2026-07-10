/**
 * Détail des manches d'un match (« set scores »).
 * Stockage : "11-7,9-11,11-8" - chaque manche "a-b" du point de vue de player_a.
 */

export type SetScore = { a: number; b: number };

/** "11-7,9-11" → [{a:11,b:7},{a:9,b:11}]. Ignore les manches vides/invalides. */
export function parseSetScores(raw: string | null | undefined): SetScore[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [a, b] = s.split('-').map((n) => Number.parseInt(n, 10));
      return { a, b };
    })
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
}

/** [{a:11,b:7}] → "11-7". Les manches incomplètes (NaN) sont retirées. */
export function formatSetScores(sets: SetScore[]): string {
  return sets
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b))
    .map((s) => `${s.a}-${s.b}`)
    .join(',');
}

/** Compte les manches gagnées de chaque côté (a strictement > b → manche pour a). */
export function countSets(sets: SetScore[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (!Number.isFinite(s.a) || !Number.isFinite(s.b) || s.a === s.b) continue;
    if (s.a > s.b) a += 1;
    else b += 1;
  }
  return { a, b };
}

/** Inverse chaque manche (vue depuis l'autre joueur) : "11-7,9-11" → "7-11,11-9". */
export function flipSetScores(raw: string | null | undefined): string {
  return formatSetScores(parseSetScores(raw).map((s) => ({ a: s.b, b: s.a })));
}

/**
 * Hack UX de saisie : quand on tape le score du PERDANT d'une manche (0–9), l'adversaire — s'il est
 * vide — passe à 11 tout seul (un joueur ≤ 9 a forcément perdu 11-x hors deuce). Renvoie la valeur à
 * appliquer à la cellule opposée, ou null pour « ne pas y toucher » :
 *  - `typed` ∈ [0,9] et opposé vide (ou déjà auto-rempli) → '11' ;
 *  - opposé auto-rempli et `typed` vidé ou ≥ 10 (deuce) → '' (on retire le 11 pour saisir le deuce) ;
 *  - sinon → null (on ne recouvre jamais une saisie manuelle).
 */
export function autofillOpponent(typed: string, oppValue: string, oppWasAuto: boolean): '11' | '' | null {
  const n = Number.parseInt(typed, 10);
  if (typed !== '' && n >= 0 && n <= 9 && (oppValue === '' || oppWasAuto)) return '11';
  if (oppWasAuto && (typed === '' || n >= 10)) return '';
  return null;
}

/** Les deux points sont saisis (entiers finis ≥ 0). */
export function isCompleteSet(s: SetScore): boolean {
  return Number.isFinite(s.a) && Number.isFinite(s.b) && s.a >= 0 && s.b >= 0;
}

/**
 * Règle officielle d'une manche de tennis de table : le gagnant atteint 11 points
 * avec au moins 2 d'écart ; au-delà de 10-10 (deuce), il faut exactement 2 d'écart.
 */
export function isValidSet(s: SetScore): boolean {
  if (!isCompleteSet(s) || s.a === s.b) return false;
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  if (hi < 11) return false;
  if (hi === 11) return lo <= 9; // 11-0 … 11-9
  return hi - lo === 2; // deuce : 12-10, 13-11, …
}

/**
 * Valide un match complet : chaque manche jouée est réglementaire, et le vainqueur
 * a exactement `ceil(bestOf/2)` manches gagnées (ni moins = incomplet, ni plus = trop saisi).
 */
export function validateMatch(sets: SetScore[], bestOf: number): { ok: boolean; error?: string } {
  const complete = sets.filter(isCompleteSet);
  if (complete.length === 0) return { ok: false, error: 'Saisis le score des manches.' };
  if (complete.some((s) => !isValidSet(s)))
    return { ok: false, error: 'Manche invalide : 11 points avec 2 d’écart (ou +2 au-delà de 10-10).' };

  const c = countSets(complete);
  const need = Math.ceil(bestOf / 2);
  const winnerSets = Math.max(c.a, c.b);
  const loserSets = Math.min(c.a, c.b);
  if (winnerSets === loserSets) return { ok: false, error: 'Il faut un vainqueur.' };
  if (winnerSets < need) return { ok: false, error: `Match incomplet : ${need} manches à gagner.` };
  if (winnerSets > need) return { ok: false, error: `Trop de manches : ${need} gagnées suffisent.` };
  return { ok: true };
}
