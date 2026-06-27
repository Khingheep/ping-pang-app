import { describe, expect, it } from 'vitest';

import { assignPoules, computePouleStandings, pairWinners, poulesOf, seedBracketRound0 } from './bracket';
import type { TournamentMatch, TournamentPlayer } from './tournaments';

function player(id: string, elo: number, poule: string | null = null, seed: number | null = null): TournamentPlayer {
  return { player_id: id, name: id.toUpperCase(), elo, poule, seed };
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

describe('assignPoules — répartition serpent', () => {
  const players = Array.from({ length: 8 }, (_, i) => player(`p${i + 1}`, 1800 - i * 100));
  const out = assignPoules(players, 4);
  const byId = Object.fromEntries(out.map((o) => [o.player_id, o]));

  it('crée le bon nombre de poules (8 / 4 → A et B)', () => {
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

describe('poulesOf', () => {
  it('liste triée et dédupliquée', () => {
    expect(poulesOf([player('a', 1, 'B'), player('b', 1, 'A'), player('c', 1, 'A')])).toEqual(['A', 'B']);
  });
});

describe('seedBracketRound0 — croisement 1ers/2es', () => {
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
