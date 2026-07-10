import { describe, expect, it } from 'vitest';

import {
  computeObjective,
  eloDelta,
  eloDeltas,
  expectedScore,
  kFactor,
  levelForElo,
  nextElo,
  startingElo,
} from './index';

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

describe('startingElo — points FFTT + 500, sinon 1000', () => {
  it('licencié : points + 500', () => {
    expect(startingElo(500)).toBe(1000); // plancher FFTT (débutant licencié)
    expect(startingElo(800)).toBe(1300);
    expect(startingElo(1712)).toBe(2212);
  });
  it('non licencié : 1000', () => {
    expect(startingElo()).toBe(1000);
    expect(startingElo(null)).toBe(1000);
    expect(startingElo(0)).toBe(1000);
    expect(startingElo(NaN)).toBe(1000);
  });
});

describe('kFactor — paliers sur matchs app joués', () => {
  it('0-5 → 80, 6-10 → 50, 11+ → 30', () => {
    expect(kFactor(0)).toBe(80);
    expect(kFactor(5)).toBe(80);
    expect(kFactor(6)).toBe(50);
    expect(kFactor(10)).toBe(50);
    expect(kFactor(11)).toBe(30);
    expect(kFactor(200)).toBe(30);
  });
});

describe('nextElo — formule de Paul', () => {
  it('gagner monte, perdre descend', () => {
    expect(nextElo(1500, 1500, true, 20)).toBeGreaterThan(1500);
    expect(nextElo(1500, 1500, false, 20)).toBeLessThan(1500);
  });
  it('victoire à ratings égaux : +40 (K=80), +25 (K=50), +15 (K=30)', () => {
    expect(nextElo(1000, 1000, true, 0)).toBe(1040);
    expect(nextElo(1000, 1000, true, 6)).toBe(1025);
    expect(nextElo(1000, 1000, true, 11)).toBe(1015);
  });
  it('match FFTT : delta ×1.2 (victoire à égalité, K=80 → +48)', () => {
    expect(nextElo(1000, 1000, true, 0, 'fftt')).toBe(1048);
    expect(eloDelta(1000, 1000, 1, 0, 'fftt')).toBeCloseTo(1.2 * eloDelta(1000, 1000, 1, 0, 'app'), 9);
  });
  it('battre plus fort rapporte plus que battre plus faible', () => {
    const vsStrong = nextElo(1200, 1600, true, 11) - 1200;
    const vsWeak = nextElo(1200, 800, true, 11) - 1200;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });
});

describe('eloDeltas — zéro-somme seulement à K égal', () => {
  it('même palier : deltas opposés', () => {
    const d = eloDeltas(1400, 1400, 'a', 20, 20);
    expect(d.a).toBe(15);
    expect(d.b).toBe(-15);
  });
  it('paliers différents : le nouveau bouge plus (non zéro-somme)', () => {
    const d = eloDeltas(1400, 1400, 'a', 0, 20); // a nouveau (K=80), b établi (K=30)
    expect(d.a).toBe(40);
    expect(d.b).toBe(-15);
    expect(d.a + d.b).not.toBe(0);
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
