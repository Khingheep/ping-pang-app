import { describe, expect, it } from 'vitest';

import { buildDiscover, buildVenueFeed, filterSlotsByPlace } from './feed';
import type { Slot } from '../slots/slots';

function slot(o: Partial<Slot> & { id: string; venueId: string; startsAt: string }): Slot {
  return {
    id: o.id,
    venueId: o.venueId,
    venueName: o.venueName ?? `Lieu ${o.venueId}`,
    venueAddress: o.venueAddress ?? null,
    venueIndoor: o.venueIndoor ?? null,
    venueLat: o.venueLat ?? null,
    venueLng: o.venueLng ?? null,
    hostId: o.hostId ?? 'h',
    hostName: o.hostName ?? 'Host',
    hostAvatar: o.hostAvatar ?? null,
    startsAt: o.startsAt,
    endsAt: o.endsAt ?? o.startsAt,
    format: o.format ?? '3sets',
    levelMin: o.levelMin ?? null,
    levelMax: o.levelMax ?? null,
    participants: o.participants ?? [],
  };
}

const PARIS = { lat: 48.8566, lng: 2.3522 };

describe('buildVenueFeed', () => {
  it('regroupe les créneaux par lieu et trie les créneaux dans le temps', () => {
    const feed = buildVenueFeed(
      [
        slot({ id: 's2', venueId: 'A', startsAt: '2026-06-30T20:00:00Z' }),
        slot({ id: 's1', venueId: 'A', startsAt: '2026-06-30T18:00:00Z' }),
        slot({ id: 's3', venueId: 'B', startsAt: '2026-06-30T19:00:00Z' }),
      ],
      null,
    );
    expect(feed).toHaveLength(2);
    const a = feed.find((e) => e.id === 'A')!;
    expect(a.slots.map((s) => s.id)).toEqual(['s1', 's2']); // trié par startsAt
    expect(a.nextStartsAt).toBe('2026-06-30T18:00:00Z');
  });

  it('trie les lieux par distance quand on a la position', () => {
    const near = slot({ id: 'n', venueId: 'near', startsAt: '2026-06-30T20:00:00Z', venueLat: 48.857, venueLng: 2.353 });
    const far = slot({ id: 'f', venueId: 'far', startsAt: '2026-06-30T18:00:00Z', venueLat: 48.95, venueLng: 2.5 });
    const feed = buildVenueFeed([far, near], PARIS);
    expect(feed[0].id).toBe('near'); // plus proche d'abord, même si son créneau est plus tard
    expect(feed[0].distanceKm).toBeLessThan(feed[1].distanceKm!);
  });

  it("sans position, trie par créneau le plus imminent et additionne les joueurs", () => {
    const feed = buildVenueFeed(
      [
        slot({ id: 'a', venueId: 'A', startsAt: '2026-06-30T21:00:00Z', participants: [{ id: 'p1', name: 'x', elo: 1000 }] }),
        slot({ id: 'b', venueId: 'B', startsAt: '2026-06-30T19:00:00Z' }),
      ],
      null,
    );
    expect(feed[0].id).toBe('B'); // 19h avant 21h
    expect(feed.find((e) => e.id === 'A')!.players).toBe(1);
  });
});

describe('filterSlotsByPlace', () => {
  const slots = [
    slot({ id: 'i', venueId: 'A', startsAt: '2026-06-30T18:00:00Z', venueIndoor: true }),
    slot({ id: 'o', venueId: 'B', startsAt: '2026-06-30T18:00:00Z', venueIndoor: false }),
    slot({ id: 'u', venueId: 'C', startsAt: '2026-06-30T18:00:00Z', venueIndoor: null }),
  ];
  it('all = tout', () => expect(filterSlotsByPlace(slots, 'all')).toHaveLength(3));
  it('indoor = uniquement intérieur', () => expect(filterSlotsByPlace(slots, 'indoor').map((s) => s.id)).toEqual(['i']));
  it('outdoor = extérieur + inconnu (non-indoor)', () => expect(filterSlotsByPlace(slots, 'outdoor').map((s) => s.id)).toEqual(['o', 'u']));
});

describe('buildDiscover', () => {
  const featured = [
    { id: 'A', name: 'Déjà au feed', address: null, indoor: true, lat: 48.857, lng: 2.353 },
    { id: 'X', name: 'Proche', address: null, indoor: true, lat: 48.858, lng: 2.351 },
    { id: 'Y', name: 'Loin', address: null, indoor: false, lat: 48.95, lng: 2.5 },
  ];
  it('exclut les lieux déjà dans le feed et trie par distance', () => {
    const out = buildDiscover(featured, PARIS, new Set(['A']));
    expect(out.map((d) => d.id)).toEqual(['X', 'Y']); // A exclu, X plus proche que Y
  });
  it('respecte la limite', () => {
    expect(buildDiscover(featured, PARIS, new Set(), 1)).toHaveLength(1);
  });
});
