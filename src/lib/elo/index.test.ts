import { describe, expect, it } from 'vitest';

import { computeObjective, eloDeltas, expectedScore, ffttPointsToElo, levelForElo, nextElo } from './index';

describe('expectedScore', () => {
  it('vaut 0.5 à ratings égaux', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 6);
  });
  it('favorise le mieux classé (>0.5) et est symétrique', () => {
    const e = expectedScore(1700, 1500);
    expect(e).toBeGreaterThan(0.5);
    expect(e + expectedScore(1500, 1700)).toBeCloseTo(1, 6);
  });
});

describe('nextElo', () => {
  it('gagner monte, perdre descend', () => {
    expect(nextElo(1500, 1500, true)).toBeGreaterThan(1500);
    expect(nextElo(1500, 1500, false)).toBeLessThan(1500);
  });
  it('victoire à ratings égaux = +16 (K=32)', () => {
    expect(nextElo(1500, 1500, true)).toBe(1516);
  });
  it('battre plus fort rapporte plus que battre plus faible', () => {
    const vsStrong = nextElo(1500, 1900, true) - 1500;
    const vsWeak = nextElo(1500, 1100, true) - 1500;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });
});

describe('eloDeltas - somme nulle à ratings égaux', () => {
  it('a gagne : delta a positif, delta b négatif, opposés', () => {
    const d = eloDeltas(1500, 1500, 'a');
    expect(d.a).toBe(16);
    expect(d.b).toBe(-16);
  });
});

describe('levelForElo - paliers', () => {
  it('mappe les seuils', () => {
    expect(levelForElo(0).key).toBe('rookie');
    expect(levelForElo(1099).key).toBe('rookie');
    expect(levelForElo(1100).key).toBe('amateur');
    expect(levelForElo(1300).key).toBe('confirme');
    expect(levelForElo(1500).key).toBe('expert');
    expect(levelForElo(1700).key).toBe('master');
    expect(levelForElo(1900).key).toBe('elite');
    expect(levelForElo(2100).key).toBe('legend');
    expect(levelForElo(9999).key).toBe('legend');
  });
});

describe('ffttPointsToElo - bornes', () => {
  it('clampe entre 800 et 2600', () => {
    expect(ffttPointsToElo(0)).toBe(1000);
    expect(ffttPointsToElo(2000)).toBe(1500);
    expect(ffttPointsToElo(100000)).toBe(2600);
    expect(ffttPointsToElo(-100000)).toBe(800);
  });
});

describe('computeObjective', () => {
  it('vise le prochain palier (1250 → 1300 Confirmé)', () => {
    const o = computeObjective(1250);
    expect(o.target).toBe(1300);
    expect(o.toGain).toBe(50);
    expect(o.nextLabel).toBe('Confirmé');
    expect(o.pct).toBeGreaterThan(0);
    expect(o.pct).toBeLessThan(1);
  });
  it('au dernier palier, vise la centaine suivante (2150 → 2200)', () => {
    const o = computeObjective(2150);
    expect(o.target).toBe(2200);
    expect(o.nextLabel).toBeNull();
  });
  it('pct borné [0,1]', () => {
    expect(computeObjective(1100).pct).toBeGreaterThanOrEqual(0);
    expect(computeObjective(1299).pct).toBeLessThanOrEqual(1);
  });
});
