import { describe, expect, it } from 'vitest';

import {
  assignPoules,
  computeFinalRanking,
  computePlayerRecords,
  computePouleStandings,
  numPoulesForPlayers,
  pairWinners,
  pouleMatchOrder,
  poulesOf,
  seedBracketRound0,
} from './bracket';
import type { TournamentMatch, TournamentPlayer } from './tournaments';

function player(
  id: string,
  elo: number,
  poule: string | null = null,
  seed: number | null = null,
  extra: { ranking?: number | null; club?: string | null } = {},
): TournamentPlayer {
  return { player_id: id, name: id.toUpperCase(), avatar: null, elo, poule, seed, ranking: extra.ranking ?? null, club: extra.club ?? null };
}

function pmatch(poule: string, a: string, b: string, winner: string | null): TournamentMatch {
  return {
    id: `${poule}-${a}-${b}`,
    tournament_id: 't',
    phase: 'poule',
    poule,
    round: null,
    slot: null,
    player_a: a,
    player_b: b,
    winner,
    score: winner ? '3-0' : null,
    set_scores: null,
  };
}

/** Match de poule avec un score en sets explicite "X-Y" (vue de player_a). */
function pmatchScore(poule: string, a: string, b: string, winner: string, score: string): TournamentMatch {
  return { ...pmatch(poule, a, b, winner), score };
}

describe('computePlayerRecords - bilan V/D global (poules + bracket)', () => {
  it('cumule victoires et défaites, ignore les matchs non joués', () => {
    const bmatch = (a: string, b: string, winner: string | null): TournamentMatch => ({
      id: `b-${a}-${b}`, tournament_id: 't', phase: 'bracket', poule: null, round: 0, slot: 0,
      player_a: a, player_b: b, winner, score: null, set_scores: null,
    });
    const rec = computePlayerRecords([
      pmatch('A', 'x', 'y', 'x'), // x bat y
      pmatch('A', 'x', 'z', 'z'), // z bat x
      bmatch('x', 'w', 'x'), // x bat w (bracket)
      bmatch('y', 'z', null), // pas encore joué → ignoré
    ]);
    expect(rec.get('x')).toEqual({ played: 3, wins: 2, losses: 1 });
    expect(rec.get('z')).toEqual({ played: 1, wins: 1, losses: 0 });
    expect(rec.get('y')).toEqual({ played: 1, wins: 0, losses: 1 });
    expect(rec.get('w')).toEqual({ played: 1, wins: 0, losses: 1 });
  });

  it('ignore les matchs à joueur manquant (bye)', () => {
    const rec = computePlayerRecords([pmatch('A', 'x', '', 'x') as TournamentMatch]);
    expect(rec.size).toBe(0);
  });
});

describe('computeFinalRanking - podium + classement', () => {
  const bm = (round: number, slot: number, a: string, b: string, winner: string | null): TournamentMatch => ({
    id: `b${round}-${slot}`, tournament_id: 't', phase: 'bracket', poule: null, round, slot,
    player_a: a, player_b: b, winner, score: null, set_scores: null,
  });
  it('champion = vainqueur finale, puis éliminés par tour décroissant', () => {
    const players = [
      player('a', 1500, null, 1), player('b', 1400, null, 2), player('c', 1300, null, 3), player('d', 1200, null, 4),
    ];
    // Demi-finales (round 0) : a bat d, b bat c → Finale (round 1) : a bat b.
    const matches = [
      bm(0, 0, 'a', 'd', 'a'),
      bm(0, 1, 'b', 'c', 'b'),
      bm(1, 0, 'a', 'b', 'a'),
    ];
    const rank = computeFinalRanking(players, matches);
    expect(rank.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']); // c(seed3) avant d(seed4), tous 2 sortis en demie
    expect(rank[0].place).toBe(1);
    expect(rank.find((r) => r.playerId === 'a')!.place).toBe(1);
    expect(rank.find((r) => r.playerId === 'b')!.place).toBe(2);
  });
  it('ajoute les non-qualifiés après, par bilan de poule', () => {
    const players = [player('a', 1500, 'A', 1), player('b', 1400, 'A', 2), player('e', 1000, 'A', 3)];
    const matches = [
      pmatch('A', 'a', 'e', 'a'), // e perd en poule
      bm(0, 0, 'a', 'b', 'a'), // finale : a bat b
    ];
    const rank = computeFinalRanking(players, matches);
    expect(rank.map((r) => r.playerId)).toEqual(['a', 'b', 'e']); // e (non qualifié) en dernier
  });
});

describe('numPoulesForPlayers - puissance de 2, poules de 3 à 5', () => {
  it('garde des poules de 3 à 5 et un nombre de poules en puissance de 2', () => {
    const cases: [number, number][] = [
      [4, 1], [6, 2], [8, 2], [12, 4], [16, 4], [20, 4], [24, 8], [32, 8], [48, 16], [64, 16],
    ];
    for (const [n, expected] of cases) {
      expect(numPoulesForPlayers(n)).toBe(expected);
      const P = numPoulesForPlayers(n);
      expect([1, 2, 4, 8, 16, 32]).toContain(P); // bracket propre
      expect(Math.ceil(n / P)).toBeLessThanOrEqual(6); // poules pas trop grosses
    }
  });
});

describe('assignPoules - répartition serpent', () => {
  const players = Array.from({ length: 8 }, (_, i) => player(`p${i + 1}`, 1800 - i * 100));
  const out = assignPoules(players, 2);
  const byId = Object.fromEntries(out.map((o) => [o.player_id, o]));

  it('crée le bon nombre de poules (2 poules → A et B)', () => {
    expect([...new Set(out.map((o) => o.poule))].sort()).toEqual(['A', 'B']);
  });
  it('seed par ELO décroissant (meilleur = seed 1)', () => {
    expect(byId.p1.seed).toBe(1);
    expect(byId.p8.seed).toBe(8);
  });
  it('serpent : A=[1,4,5,8], B=[2,3,6,7]', () => {
    const seedsOf = (poule: string) => out.filter((o) => o.poule === poule).map((o) => o.seed).sort((x, y) => x - y);
    expect(seedsOf('A')).toEqual([1, 4, 5, 8]);
    expect(seedsOf('B')).toEqual([2, 3, 6, 7]);
  });
  it('poules équilibrées (4 / 4)', () => {
    expect(out.filter((o) => o.poule === 'A')).toHaveLength(4);
    expect(out.filter((o) => o.poule === 'B')).toHaveLength(4);
  });
});

describe('assignPoules - seeding par classement FFTT', () => {
  it('le classement FFTT prime sur l’ELO ; un classé passe devant un non-classé', () => {
    const ps = [
      player('rankLow', 1900, null, null, { ranking: 800 }), // gros ELO mais classement faible
      player('rankHigh', 1100, null, null, { ranking: 2000 }), // petit ELO mais meilleur classement
      player('noRank', 1800, null, null, { ranking: null }), // non licencié
    ];
    const out = assignPoules(ps, 1);
    const seedOf = (id: string) => out.find((o) => o.player_id === id)!.seed;
    expect(seedOf('rankHigh')).toBe(1);
    expect(seedOf('rankLow')).toBe(2);
    expect(seedOf('noRank')).toBe(3); // non-classé toujours en dernier
  });
});

describe('assignPoules - séparation des joueurs d’un même club', () => {
  it('évite deux joueurs du même club dans la même poule', () => {
    // Serpent brut : A=[p1,p4], B=[p2,p3]. p1 et p4 = même club → p4 doit changer de poule.
    const ps = [
      player('p1', 1800, null, null, { club: 'X' }),
      player('p2', 1700, null, null, { club: 'Y' }),
      player('p3', 1600, null, null, { club: 'Z' }),
      player('p4', 1500, null, null, { club: 'X' }),
    ];
    const out = assignPoules(ps, 2);
    const pouleOf = (id: string) => out.find((o) => o.player_id === id)!.poule;
    expect(pouleOf('p1')).not.toBe(pouleOf('p4'));
  });
});

describe('seedBracketRound0 - qualifiés configurables', () => {
  // 2 poules de 3, tous les matchs joués → classements nets a1>a2>a3, b1>b2>b3.
  const players = [
    player('a1', 1, 'A', 1), player('a2', 1, 'A', 3), player('a3', 1, 'A', 5),
    player('b1', 1, 'B', 2), player('b2', 1, 'B', 4), player('b3', 1, 'B', 6),
  ];
  const matches = [
    pmatch('A', 'a1', 'a2', 'a1'), pmatch('A', 'a1', 'a3', 'a1'), pmatch('A', 'a2', 'a3', 'a2'),
    pmatch('B', 'b1', 'b2', 'b1'), pmatch('B', 'b1', 'b3', 'b1'), pmatch('B', 'b2', 'b3', 'b2'),
  ];

  it('1 qualifié par poule → 1 match (les 2 premiers)', () => {
    const pairs = seedBracketRound0(players, matches, 1);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].playerA, pairs[0].playerB].sort()).toEqual(['a1', 'b1']);
  });
  it('2 qualifiés → 2 matchs, aucun face-à-face de même poule', () => {
    const pairs = seedBracketRound0(players, matches, 2);
    expect(pairs).toHaveLength(2);
    const pouleOf = (id: string | null) => players.find((p) => p.player_id === id)?.poule;
    for (const p of pairs) expect(pouleOf(p.playerA)).not.toBe(pouleOf(p.playerB));
  });
  it('3 qualifiés → tous les joueurs entrent au tableau (6 → 8 slots, 4 matchs)', () => {
    const pairs = seedBracketRound0(players, matches, 3);
    expect(pairs).toHaveLength(4); // 6 qualifiés complétés par 2 exempts
    const present = pairs.flatMap((p) => [p.playerA, p.playerB]).filter(Boolean);
    expect(new Set(present).size).toBe(6);
  });
});

describe('computePouleStandings', () => {
  const players = [player('x', 1500, 'A'), player('y', 1400, 'A'), player('z', 1300, 'A')];
  const matches = [pmatch('A', 'x', 'y', 'x'), pmatch('A', 'x', 'z', 'x'), pmatch('A', 'y', 'z', 'y')];
  const st = computePouleStandings(players, matches, 'A');

  it('classe par victoires : x(2-0) > y(1-1) > z(0-2)', () => {
    expect(st.map((s) => s.playerId)).toEqual(['x', 'y', 'z']);
  });
  it('compte V/D correctement', () => {
    expect(st[0]).toMatchObject({ playerId: 'x', wins: 2, losses: 0, played: 2 });
    expect(st[1]).toMatchObject({ playerId: 'y', wins: 1, losses: 1 });
    expect(st[2]).toMatchObject({ playerId: 'z', wins: 0, losses: 2 });
  });
  it('ignore les matchs non joués (winner null)', () => {
    const partial = computePouleStandings(players, [pmatch('A', 'x', 'y', null)], 'A');
    expect(partial.every((s) => s.played === 0)).toBe(true);
  });
});

describe('pouleMatchOrder - ordre FFTT', () => {
  it('poule de 4 : 1-4, 2-3, 1-3, 2-4, 1-2, 3-4', () => {
    expect(pouleMatchOrder(4)).toEqual([[1, 4], [2, 3], [1, 3], [2, 4], [1, 2], [3, 4]]);
  });
  it('couvre toutes les paires une seule fois (tailles 2 à 6)', () => {
    for (let n = 2; n <= 6; n++) {
      const order = pouleMatchOrder(n);
      expect(order).toHaveLength((n * (n - 1)) / 2);
      const keys = new Set(order.map(([i, j]) => `${i}-${j}`));
      expect(keys.size).toBe(order.length); // pas de doublon
      for (const [i, j] of order) expect(i).toBeLessThan(j); // toujours rang faible en premier
    }
  });
});

describe('computePouleStandings - triangulaire (set-average FFTT)', () => {
  // Cycle a>b>c>a, tous à 1 victoire. Départage par set-average sur leurs matchs mutuels.
  const players = [player('a', 1500, 'A', 1), player('b', 1400, 'A', 2), player('c', 1300, 'A', 3)];
  const matches = [
    pmatchScore('A', 'a', 'b', 'a', '3-1'),
    pmatchScore('A', 'b', 'c', 'b', '3-0'),
    pmatchScore('A', 'c', 'a', 'c', '3-2'),
  ];
  const st = computePouleStandings(players, matches, 'A');

  it('tous à 1 victoire → départagés par average des sets : b > a > c', () => {
    expect(st.map((s) => s.wins)).toEqual([1, 1, 1]);
    // b : 4/3 ≈ 1.33 ; a : 5/4 = 1.25 ; c : 3/5 = 0.6
    expect(st.map((s) => s.playerId)).toEqual(['b', 'a', 'c']);
  });
  it('cumule sets gagnés / perdus sur toute la poule', () => {
    expect(st.find((s) => s.playerId === 'a')).toMatchObject({ setsWon: 5, setsLost: 4 });
  });

  // Égalité NON cyclique : a>b>c entre eux → départagés par les victoires particulières (étape FFTT
  // qui passe AVANT le set-average), même si tous les matchs sont gagnés 3-0 (set-average identique).
  it('égalité à 3 non cyclique → ordre par victoires entre ex-æquo (a, b, c)', () => {
    const ps = [
      player('a', 1500, 'A', 1), player('b', 1400, 'A', 2), player('c', 1300, 'A', 3),
      player('d', 1200, 'A', 4), player('e', 1100, 'A', 5),
    ];
    const ms = [
      pmatch('A', 'a', 'b', 'a'), pmatch('A', 'a', 'c', 'a'), pmatch('A', 'b', 'c', 'b'),
      pmatch('A', 'b', 'd', 'b'), pmatch('A', 'c', 'd', 'c'), pmatch('A', 'c', 'e', 'c'),
      pmatch('A', 'd', 'a', 'd'), pmatch('A', 'e', 'a', 'e'), pmatch('A', 'e', 'b', 'e'),
      pmatch('A', 'e', 'd', 'e'),
    ];
    const r = computePouleStandings(ps, ms, 'A');
    // e=3V (seul), trio a/b/c=2V départagé par victoires particulières (a>b>c), d=1V.
    expect(r.map((s) => s.playerId)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });
});

describe('poulesOf', () => {
  it('liste triée et dédupliquée', () => {
    expect(poulesOf([player('a', 1, 'B'), player('b', 1, 'A'), player('c', 1, 'A')])).toEqual(['A', 'B']);
  });
});

describe('seedBracketRound0 - croisement 1ers/2es', () => {
  // Poule A : a1 > a2 ; Poule B : b1 > b2
  const players = [player('a1', 1, 'A'), player('a2', 1, 'A'), player('b1', 1, 'B'), player('b2', 1, 'B')];
  const matches = [pmatch('A', 'a1', 'a2', 'a1'), pmatch('B', 'b1', 'b2', 'b1')];

  it('croise : 1er A vs 2e B, 1er B vs 2e A', () => {
    expect(seedBracketRound0(players, matches)).toEqual([
      { playerA: 'a1', playerB: 'b2' },
      { playerA: 'b1', playerB: 'a2' },
    ]);
  });
});

describe('pairWinners', () => {
  it('apparie 2 par 2 dans l’ordre', () => {
    expect(pairWinners(['w0', 'w1', 'w2', 'w3'])).toEqual([
      { playerA: 'w0', playerB: 'w1' },
      { playerA: 'w2', playerB: 'w3' },
    ]);
  });
  it('nombre impair → dernier en bye (playerB null)', () => {
    expect(pairWinners(['w0', 'w1', 'w2'])).toEqual([
      { playerA: 'w0', playerB: 'w1' },
      { playerA: 'w2', playerB: null },
    ]);
  });
});
