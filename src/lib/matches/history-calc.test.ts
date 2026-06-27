import { describe, expect, it } from 'vitest';

import { computeEloProgression, computeStats, formatFromBestOf, last7Delta } from './history-calc';
import type { MatchView } from './history';

function mv(o: Partial<MatchView>): MatchView {
  return {
    id: 'm',
    opponent: 'x',
    score: '3-0',
    setScores: null,
    won: true,
    delta: 0,
    ranked: true,
    date: '2026-06-15T12:00:00',
    status: 'confirmed',
    iProposed: true,
    format: 'WTT',
    ...o,
  };
}

describe('formatFromBestOf', () => {
  it('mappe best_of → libellé', () => {
    expect(formatFromBestOf(7)).toBe('WTT');
    expect(formatFromBestOf(3)).toBe('Bo3');
    expect(formatFromBestOf(5)).toBe('Bo5');
    expect(formatFromBestOf(null)).toBe('Bo5');
  });
});

describe('computeStats — uniquement classés + confirmés', () => {
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

describe('last7Delta', () => {
  const now = new Date('2026-06-20T12:00:00').getTime();
  it('somme les deltas classés confirmés des 7 derniers jours', () => {
    const matches = [
      mv({ id: '1', date: '2026-06-18T12:00:00', delta: 10 }), // dans la fenêtre
      mv({ id: '2', date: '2026-06-10T12:00:00', delta: 5 }), // > 7 jours → exclu
      mv({ id: '3', date: '2026-06-19T12:00:00', delta: 3, ranked: false }), // amical → exclu
      mv({ id: '4', date: '2026-06-19T12:00:00', delta: 7, status: 'pending' }), // non confirmé → exclu
    ];
    expect(last7Delta(matches, now)).toBe(10);
  });
});

describe('computeEloProgression', () => {
  const now = new Date('2026-06-20T12:00:00');
  const matches = [
    mv({ id: '1', date: '2026-06-15T12:00:00', delta: 12 }), // juin
    mv({ id: '2', date: '2026-06-16T12:00:00', delta: -4 }), // juin
    mv({ id: '3', date: '2026-05-10T12:00:00', delta: 20 }), // mai
    mv({ id: '4', date: '2026-06-17T12:00:00', delta: 100, ranked: false }), // ignoré
  ];
  const prog = computeEloProgression(matches, now);

  it('6 mois, mois courant = +8 (12 - 4)', () => {
    expect(prog.months).toHaveLength(6);
    expect(prog.thisMonth).toBe(8);
    expect(prog.months[5].delta).toBe(8); // juin
  });
  it('le mois précédent agrège son delta (mai = 20)', () => {
    expect(prog.months[4].delta).toBe(20);
  });
});
