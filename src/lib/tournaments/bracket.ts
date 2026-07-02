/**
 * Logique PURE des tournois (aucune dépendance Supabase / React Native) - testable en unitaire :
 * répartition serpent des poules, classement de poule, et seeding du bracket.
 * Les imports de types sont effacés à la compilation (pas de cycle runtime avec tournaments.ts).
 */

import { parseSetScores } from '../matches/sets';

import type { PouleStanding, TournamentMatch, TournamentPlayer } from './tournaments';

export type BracketPair = { playerA: string | null; playerB: string | null };

/**
 * Ordre officiel des rencontres d'une poule (« brûlage » FFTT), par rang intra-poule (1 = tête
 * de série de la poule). Les têtes de série jouent en dernier les matchs décisifs (1-2),
 * et un même joueur n'enchaîne jamais deux matchs d'affilée tant que possible.
 * Couvre toutes les paires une seule fois - taille de poule ∈ [2, 6] (cf. numPoulesForPlayers).
 */
const POULE_ORDERS: Record<number, [number, number][]> = {
  2: [[1, 2]],
  3: [[1, 2], [1, 3], [2, 3]],
  4: [[1, 4], [2, 3], [1, 3], [2, 4], [1, 2], [3, 4]],
  5: [[1, 4], [2, 5], [1, 3], [2, 4], [3, 5], [1, 2], [3, 4], [1, 5], [2, 3], [4, 5]],
  6: [[1, 6], [2, 5], [3, 4], [1, 4], [2, 6], [3, 5], [1, 3], [4, 6], [2, 4], [1, 5], [3, 6], [2, 3], [1, 2], [4, 5], [5, 6]],
};

/**
 * Paires de rangs (1-indexés) dans l'ordre FFTT pour une poule de `n` joueurs. Si la taille
 * n'est pas tabulée (sécurité), on retombe sur un round-robin naïf qui couvre toutes les paires.
 */
export function pouleMatchOrder(n: number): [number, number][] {
  if (POULE_ORDERS[n]) return POULE_ORDERS[n];
  const pairs: [number, number][] = [];
  for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) pairs.push([i, j]);
  return pairs;
}

/**
 * Nombre de poules à créer pour N joueurs : la plus grande puissance de 2 telle que
 * chaque poule garde ≥ 3 joueurs en moyenne. Conséquences :
 *  - taille de poule ∈ [3, 5] (parfois 6) → round-robin ni trop court ni trop long ;
 *  - nombre de poules = puissance de 2 → le tableau final est toujours « propre »
 *    (8→2 poules, 16→4, 24→8, 32→8, 48→16, 64→16…), sans bye bancal.
 */
export function numPoulesForPlayers(n: number): number {
  for (const P of [32, 16, 8, 4, 2]) {
    if (n >= P * 3) return P;
  }
  return 1;
}

/**
 * Force d'un joueur pour le seeding : classement officiel FFTT d'abord (plus de points = plus fort),
 * repli sur l'ELO interne si non licencié. Un joueur classé passe toujours devant un non-classé.
 */
function strengthCompare(a: TournamentPlayer, b: TournamentPlayer): number {
  const ar = a.ranking;
  const br = b.ranking;
  if (ar != null && br != null) return br - ar || b.elo - a.elo;
  if (ar != null) return -1; // a classé, b non → a devant
  if (br != null) return 1;
  return b.elo - a.elo; // les deux non classés → ELO
}

/**
 * Répartition « serpent » par force (classement FFTT puis ELO) dans `numPoules` poules, pour
 * équilibrer les niveaux : les meilleurs deviennent têtes de série de poules différentes.
 * On évite en plus, autant que possible, deux joueurs du même club dans une même poule (reco FFTT
 * I.302) en permutant les colonnes d'une même rangée du serpent. Les poules diffèrent d'au plus 1 joueur.
 */
export function assignPoules(
  players: TournamentPlayer[],
  numPoules: number,
): { player_id: string; poule: string; seed: number }[] {
  const sorted = [...players].sort(strengthCompare);
  const P = Math.max(1, numPoules);
  const clubsInPoule: Set<string>[] = Array.from({ length: P }, () => new Set<string>());
  const out: { player_id: string; poule: string; seed: number }[] = [];

  for (let row = 0; row * P < sorted.length; row++) {
    const rowPlayers = sorted.slice(row * P, row * P + P);
    // Poule cible « serpent » de chaque joueur de la rangée (bijection rang→poule sur la rangée).
    const target = rowPlayers.map((_, k) => (row % 2 === 0 ? k : P - 1 - k));
    const assign = [...target];

    // Dé-collision club : si un joueur tombe dans une poule contenant déjà son club, on tente
    // d'échanger sa poule avec celle d'un autre joueur de la rangée, sans créer de nouvelle collision.
    for (let k = 0; k < rowPlayers.length; k++) {
      const club = rowPlayers[k].club;
      if (!club || !clubsInPoule[assign[k]].has(club)) continue;
      for (let m = 0; m < rowPlayers.length; m++) {
        if (m === k) continue;
        const otherClub = rowPlayers[m].club;
        const kFits = !clubsInPoule[assign[m]].has(club);
        const mFits = !otherClub || !clubsInPoule[assign[k]].has(otherClub);
        if (kFits && mFits) {
          [assign[k], assign[m]] = [assign[m], assign[k]];
          break;
        }
      }
    }

    rowPlayers.forEach((p, k) => {
      const pouleIdx = assign[k];
      if (p.club) clubsInPoule[pouleIdx].add(p.club);
      out.push({ player_id: p.player_id, poule: String.fromCharCode(65 + pouleIdx), seed: row * P + k + 1 });
    });
  }
  return out;
}

/** Liste triée des poules présentes (A, B, C…). */
export function poulesOf(players: TournamentPlayer[]): string[] {
  return [...new Set(players.map((p) => p.poule).filter((x): x is string => !!x))].sort();
}

type Tally = { setsWon: number; setsLost: number; pointsWon: number; pointsLost: number };

/** Cumule sets et points gagnés/perdus d'un joueur sur un ensemble de matchs joués. */
function tally(playerId: string, matches: TournamentMatch[]): Tally {
  let setsWon = 0;
  let setsLost = 0;
  let pointsWon = 0;
  let pointsLost = 0;
  for (const m of matches) {
    if (!m.winner) continue;
    const isA = m.player_a === playerId;
    const isB = m.player_b === playerId;
    if (!isA && !isB) continue;
    const sets = parseSetScores(m.set_scores);
    if (sets.length) {
      // Détail des manches connu → sets ET points exacts.
      for (const s of sets) {
        const mine = isA ? s.a : s.b;
        const opp = isA ? s.b : s.a;
        pointsWon += mine;
        pointsLost += opp;
        if (mine > opp) setsWon += 1;
        else if (opp > mine) setsLost += 1;
      }
    } else if (m.score) {
      // Pas de détail : on récupère au moins les sets depuis le score agrégé "3-1".
      const [x, y] = m.score.split('-').map((n) => Number.parseInt(n, 10));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        setsWon += isA ? x : y;
        setsLost += isA ? y : x;
      }
    }
  }
  return { setsWon, setsLost, pointsWon, pointsLost };
}

/** Quotient gagnés/perdus (average FFTT). 0 perdu → +∞ si on a gagné, neutre (1) sinon. */
function avg(won: number, lost: number): number {
  if (lost === 0) return won > 0 ? Number.POSITIVE_INFINITY : 1;
  return won / lost;
}

/**
 * Classement d'une poule (épreuve individuelle FFTT, art. I.303), trié par :
 *   1. victoires (décroissant) ;
 *   2. en cas d'égalité - y compris triangulaire (≥ 3 joueurs) - départage calculé UNIQUEMENT
 *      sur les matchs entre les ex-æquo, dans l'ordre FFTT : (a) victoires particulières,
 *      (b) set-average (quotient manches), (c) point-average (quotient points) ;
 *   3. à défaut, tête de série (seed).
 * Les sets/points affichés (`setsWon`…) couvrent en revanche TOUTE la poule.
 */
export function computePouleStandings(
  players: TournamentPlayer[],
  matches: TournamentMatch[],
  poule: string,
): PouleStanding[] {
  const inPoule = players.filter((p) => p.poule === poule);
  const pouleMatches = matches.filter((m) => m.phase === 'poule' && m.poule === poule && m.winner);
  const seedOf = (id: string) => inPoule.find((p) => p.player_id === id)?.seed ?? 999;

  const rows: PouleStanding[] = inPoule.map((p) => {
    const played = pouleMatches.filter((m) => m.player_a === p.player_id || m.player_b === p.player_id);
    const wins = played.filter((m) => m.winner === p.player_id).length;
    const t = tally(p.player_id, played);
    return { playerId: p.player_id, name: p.name, played: played.length, wins, losses: played.length - wins, ...t };
  });

  // Groupes de joueurs à égalité de victoires → départage interne sur leurs matchs mutuels.
  const byWins = new Map<number, PouleStanding[]>();
  for (const r of rows) {
    if (!byWins.has(r.wins)) byWins.set(r.wins, []);
    byWins.get(r.wins)!.push(r);
  }
  const out: PouleStanding[] = [];
  for (const wins of [...byWins.keys()].sort((a, b) => b - a)) {
    const group = byWins.get(wins)!;
    if (group.length <= 1) {
      out.push(...group);
      continue;
    }
    const ids = new Set(group.map((g) => g.playerId));
    const mutual = pouleMatches.filter((m) => ids.has(m.player_a ?? '') && ids.has(m.player_b ?? ''));
    const ranked = group
      .map((g) => ({
        g,
        mWins: mutual.filter((m) => m.winner === g.playerId).length, // victoires entre ex-æquo
        t: tally(g.playerId, mutual),
      }))
      .sort(
        (a, b) =>
          b.mWins - a.mWins ||
          avg(b.t.setsWon, b.t.setsLost) - avg(a.t.setsWon, a.t.setsLost) ||
          avg(b.t.pointsWon, b.t.pointsLost) - avg(a.t.pointsWon, a.t.pointsLost) ||
          seedOf(a.g.playerId) - seedOf(b.g.playerId),
      )
      .map((x) => x.g);
    out.push(...ranked);
  }
  return out;
}

export type PlayerRecord = { played: number; wins: number; losses: number };

/**
 * Bilan Victoires/Défaites global d'un joueur sur TOUT le tournoi (poules + tableau), pour la vue
 * Participants. Ne compte que les matchs effectivement joués (avec un vainqueur).
 */
export function computePlayerRecords(matches: TournamentMatch[]): Map<string, PlayerRecord> {
  const rec = new Map<string, PlayerRecord>();
  const get = (id: string): PlayerRecord => {
    let r = rec.get(id);
    if (!r) {
      r = { played: 0, wins: 0, losses: 0 };
      rec.set(id, r);
    }
    return r;
  };
  for (const m of matches) {
    if (!m.winner || !m.player_a || !m.player_b) continue;
    const a = get(m.player_a);
    const b = get(m.player_b);
    a.played += 1;
    b.played += 1;
    if (m.winner === m.player_a) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  }
  return rec;
}

export type FinalRankEntry = { playerId: string; name: string; place: number };

/**
 * Classement final du tournoi (état `done`), pour le podium + la liste. Ordre :
 *  1) le champion (vainqueur de la finale) ;
 *  2) les éliminés du tableau, par TOUR d'élimination décroissant (perdu en finale > en demie >
 *     en quart…), départagés par tête de série ;
 *  3) les joueurs non qualifiés en tableau, par bilan V/D global puis tête de série.
 * (Pas de petite finale → les 2 demi-finalistes battus sont départagés au seed, ex-æquo 3e/4e.)
 */
export function computeFinalRanking(players: TournamentPlayer[], matches: TournamentMatch[]): FinalRankEntry[] {
  const nameOf = (id: string) => players.find((p) => p.player_id === id)?.name ?? 'Joueur';
  const seedOf = (id: string) => players.find((p) => p.player_id === id)?.seed ?? 999;
  const ordered: string[] = [];
  const push = (id: string | null | undefined) => {
    if (id && !ordered.includes(id)) ordered.push(id);
  };

  const bracket = matches.filter((m) => m.phase === 'bracket' && m.winner);
  if (bracket.length) {
    const maxRound = Math.max(...bracket.map((m) => m.round ?? 0));
    push(bracket.find((m) => (m.round ?? 0) === maxRound)?.winner); // champion = vainqueur de la finale
    bracket
      .map((m) => ({ id: m.winner === m.player_a ? m.player_b : m.player_a, round: m.round ?? 0 }))
      .filter((e): e is { id: string; round: number } => !!e.id)
      .sort((a, b) => b.round - a.round || seedOf(a.id) - seedOf(b.id))
      .forEach((e) => push(e.id));
  }

  // Reste (non départagés par le tableau) : bilan V/D global décroissant, puis tête de série.
  const rec = computePlayerRecords(matches);
  players
    .filter((p) => !ordered.includes(p.player_id))
    .sort((a, b) => (rec.get(b.player_id)?.wins ?? 0) - (rec.get(a.player_id)?.wins ?? 0) || seedOf(a.player_id) - seedOf(b.player_id))
    .forEach((p) => push(p.player_id));

  return ordered.map((id, i) => ({ playerId: id, name: nameOf(id), place: i + 1 }));
}

/** Plus petite puissance de 2 ≥ n (≥ 1). */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Ordre de placement « tête de série » standard pour un tableau de `size` (puissance de 2) :
 * renvoie les seeds 1-indexés dans l'ordre des slots, de sorte que le seed 1 et le seed 2 soient
 * dans des moitiés opposées (ne se croisent qu'en finale), etc. Ex. size 4 → [1,4,2,3].
 */
function standardSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(sum - s);
    }
    order = next;
  }
  return order;
}

/**
 * Seeding du 1er tour du tableau à partir des `qualifiersPerPoule` premiers de chaque poule.
 * Les qualifiés sont ordonnés par rang de poule (tous les 1ers, puis les 2es…) puis par force
 * (seed d'origine), placés aux positions « têtes de série » standard. On tente enfin d'éviter que
 * deux joueurs d'une même poule se retrouvent dès le 1er tour, en permutant des slots.
 */
export function seedBracketRound0(
  players: TournamentPlayer[],
  matches: TournamentMatch[],
  qualifiersPerPoule = 2,
): BracketPair[] {
  const poules = poulesOf(players);
  const pouleOf = (id: string) => players.find((p) => p.player_id === id)?.poule ?? '';
  const seedOf = (id: string) => players.find((p) => p.player_id === id)?.seed ?? 999;

  // Récupère les qualifiés avec leur rang de poule (0 = 1er, 1 = 2e, …).
  const entrants: { id: string; rank: number }[] = [];
  for (const poule of poules) {
    const st = computePouleStandings(players, matches, poule);
    for (let r = 0; r < qualifiersPerPoule && r < st.length; r++) entrants.push({ id: st[r].playerId, rank: r });
  }
  if (!entrants.length) return [];

  // Ordre global : meilleur rang de poule d'abord, puis meilleure tête de série.
  entrants.sort((a, b) => a.rank - b.rank || seedOf(a.id) - seedOf(b.id));
  const ids = entrants.map((e) => e.id);

  const size = nextPow2(ids.length);
  const order = standardSeedOrder(size);
  const slots = order.map((s) => ids[s - 1] ?? null); // null = exempt (bye)

  // Évite les face-à-face de même poule au 1er tour : si une paire oppose deux joueurs d'une même
  // poule, on échange l'un d'eux avec le slot d'une autre paire (sans recréer de collision).
  const samePoule = (x: string | null, y: string | null) => !!x && !!y && pouleOf(x) === pouleOf(y);
  for (let i = 0; i < slots.length; i += 2) {
    if (!samePoule(slots[i], slots[i + 1])) continue;
    for (let j = 0; j < slots.length; j++) {
      if (j === i || j === i + 1) continue;
      const partnerIdx = j % 2 === 0 ? j + 1 : j - 1;
      // Échange slots[i+1] ↔ slots[j] si ça résout sans créer de nouvelle collision de poule.
      if (!samePoule(slots[i], slots[j]) && !samePoule(slots[partnerIdx], slots[i + 1])) {
        [slots[i + 1], slots[j]] = [slots[j], slots[i + 1]];
        break;
      }
    }
  }

  const pairs: BracketPair[] = [];
  for (let i = 0; i < slots.length; i += 2) pairs.push({ playerA: slots[i], playerB: slots[i + 1] });
  return pairs;
}

/** Appariement des vainqueurs d'un tour (dans l'ordre des slots) → matchs du tour suivant. */
export function pairWinners(winners: string[]): BracketPair[] {
  const pairs: BracketPair[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push({ playerA: winners[i] ?? null, playerB: winners[i + 1] ?? null });
  }
  return pairs;
}
