import { describe, expect, it } from 'vitest';

import { buildEloProgression, computeStats, formatFromBestOf } from './history-calc';
import type { MatchView } from './history';

function mv(o: Partial<MatchView>): MatchView {
  return {
    id: 'm',
    opponent: 'x',
    opponentId: 'opp',
    score: '3-0',
    setScores: null,
    won: true,
    delta: 0,
    ranked: true,
    date: '2026-06-15T12:00:00',
    status: 'confirmed',
    iProposed: true,
    format: 'BO5',
    likeCount: 0,
    liked: false,
    commentCount: 0,
    ...o,
  };
}

describe('formatFromBestOf', () => {
  it('mappe best_of → libellé', () => {
    expect(formatFromBestOf(7)).toBe('BO7');
    expect(formatFromBestOf(3)).toBe('BO3');
    expect(formatFromBestOf(5)).toBe('BO5');
    expect(formatFromBestOf(null)).toBe('BO5');
  });
});

describe('computeStats - uniquement classés + confirmés', () => {
  const matches = [
    mv({ id: '1', won: true }),
    mv({ id: '2', won: true }),
    mv({ id: '3', won: false }),
    mv({ id: '4', won: true, ranked: false }), // amical → ignoré
    mv({ id: '5', won: true, status: 'pending' }), // non confirmé → ignoré
  ];
  it('total = 3, wins = 2, winPct = 67', () => {
    expect(computeStats(matches)).toEqual({ total: 3, wins: 2, winPct: 67 });
  });
  it('aucun match classé → winPct null', () => {
    expect(computeStats([mv({ ranked: false })])).toEqual({ total: 0, wins: 0, winPct: null });
  });
});

describe('buildEloProgression', () => {
  const now = new Date('2026-06-20T12:00:00');
  const history = [
    { elo: 1200, at: '2026-05-20T12:00:00' }, // baseline (mois précédent)
    { elo: 1212, at: '2026-06-05T12:00:00' }, // ce mois
    { elo: 1208, at: '2026-06-16T12:00:00' }, // ce mois
  ];

  it('series chronologique, sans doublon si le dernier snapshot == ELO courant', () => {
    expect(buildEloProgression(history, 1208, now).series).toEqual([1200, 1212, 1208]);
  });
  it("ajoute l'ELO courant à la fin s'il diffère du dernier snapshot", () => {
    expect(buildEloProgression(history, 1210, now).series).toEqual([1200, 1212, 1208, 1210]);
  });
  it('thisMonth = ELO courant − ELO au 1er du mois (dernier snapshot antérieur)', () => {
    expect(buildEloProgression(history, 1208, now).thisMonth).toBe(8); // 1208 − 1200
  });
  it('sans snapshot avant le mois, base = plus ancien snapshot connu', () => {
    const p = buildEloProgression([{ elo: 1205, at: '2026-06-10T12:00:00' }], 1215, now);
    expect(p.thisMonth).toBe(10); // 1215 − 1205
  });
  it('historique vide → series = [courant], thisMonth = 0', () => {
    expect(buildEloProgression([], 1300, now)).toEqual({ series: [1300], thisMonth: 0 });
  });
});
