import { describe, expect, it } from 'vitest';

import {
  countSets,
  flipSetScores,
  formatSetScores,
  isValidSet,
  parseSetScores,
  validateMatch,
} from './sets';

describe('isValidSet — règle officielle (11 pts, 2 d’écart)', () => {
  it('accepte 11-0 … 11-9', () => {
    expect(isValidSet({ a: 11, b: 0 })).toBe(true);
    expect(isValidSet({ a: 11, b: 9 })).toBe(true);
    expect(isValidSet({ a: 9, b: 11 })).toBe(true);
  });
  it('refuse 11-10 (écart 1)', () => {
    expect(isValidSet({ a: 11, b: 10 })).toBe(false);
  });
  it('accepte le deuce avec 2 d’écart (12-10, 13-11, 14-12)', () => {
    expect(isValidSet({ a: 12, b: 10 })).toBe(true);
    expect(isValidSet({ a: 13, b: 11 })).toBe(true);
    expect(isValidSet({ a: 14, b: 12 })).toBe(true);
  });
  it('refuse le deuce sans 2 d’écart (12-11, 13-10)', () => {
    expect(isValidSet({ a: 12, b: 11 })).toBe(false);
    expect(isValidSet({ a: 13, b: 10 })).toBe(false);
  });
  it('refuse gagnant < 11, égalité, 0-0', () => {
    expect(isValidSet({ a: 10, b: 8 })).toBe(false);
    expect(isValidSet({ a: 11, b: 11 })).toBe(false);
    expect(isValidSet({ a: 0, b: 0 })).toBe(false);
  });
});

describe('countSets', () => {
  it('compte les manches gagnées de chaque côté', () => {
    expect(countSets([{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 11, b: 8 }])).toEqual({ a: 2, b: 1 });
  });
});

describe('validateMatch — vainqueur à ceil(bestOf/2)', () => {
  it('Bo5 : 3-1 et 3-0 valides', () => {
    expect(validateMatch([{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 11, b: 8 }, { a: 11, b: 5 }], 5).ok).toBe(true);
    expect(validateMatch([{ a: 11, b: 7 }, { a: 11, b: 2 }, { a: 11, b: 8 }], 5).ok).toBe(true);
  });
  it('Bo5 : 2-1 incomplet, 2-2 sans vainqueur, 4-1 trop de manches', () => {
    expect(validateMatch([{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 11, b: 8 }], 5).ok).toBe(false);
    expect(validateMatch([{ a: 11, b: 7 }, { a: 5, b: 11 }, { a: 11, b: 8 }, { a: 6, b: 11 }], 5).ok).toBe(false);
    expect(validateMatch([{ a: 11, b: 1 }, { a: 11, b: 1 }, { a: 11, b: 1 }, { a: 9, b: 11 }, { a: 11, b: 1 }], 5).ok).toBe(false);
  });
  it('rejette une manche illégale dans un score par ailleurs gagnant', () => {
    expect(validateMatch([{ a: 11, b: 7 }, { a: 11, b: 10 }, { a: 11, b: 8 }], 5).ok).toBe(false);
  });
  it('Bo3 : 2-0 valide, 1-0 incomplet, vide rejeté', () => {
    expect(validateMatch([{ a: 11, b: 7 }, { a: 11, b: 9 }], 3).ok).toBe(true);
    expect(validateMatch([{ a: 11, b: 7 }], 3).ok).toBe(false);
    expect(validateMatch([], 5).ok).toBe(false);
  });
});

describe('parse / format / flip', () => {
  it('round-trip parse↔format', () => {
    expect(formatSetScores(parseSetScores('11-7,9-11,11-8'))).toBe('11-7,9-11,11-8');
  });
  it('flip inverse chaque manche', () => {
    expect(flipSetScores('11-7,9-11')).toBe('7-11,11-9');
  });
  it('parse vide → []', () => {
    expect(parseSetScores('')).toHaveLength(0);
    expect(parseSetScores(null)).toHaveLength(0);
  });
});
