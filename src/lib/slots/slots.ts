import { supabase } from '@/lib/supabase/client';

export type SlotFormat = 'ntt' | '3sets' | '2sets';
export type SlotParticipant = { id: string; name: string; elo: number };

export type Slot = {
  id: string;
  venueId: string;
  venueName: string;
  venueLat: number | null;
  venueLng: number | null;
  hostId: string;
  hostName: string;
  startsAt: string;
  endsAt: string;
  format: SlotFormat;
  levelMin: number | null;
  levelMax: number | null;
  participants: SlotParticipant[];
};

type Row = {
  id: string;
  venue_id: string;
  host_id: string;
  starts_at: string;
  ends_at: string;
  format: string;
  level_min: number | null;
  level_max: number | null;
  host: { display_name: string } | null;
  venues: { name: string; lat: number | null; lng: number | null } | null;
  slot_participants: { player_id: string; players: { display_name: string; elo: number } | null }[];
};

const SELECT =
  'id, venue_id, host_id, starts_at, ends_at, format, level_min, level_max, host:host_id(display_name), venues(name, lat, lng), slot_participants(player_id, players(display_name, elo))';

function mapRow(r: Row): Slot {
  return {
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venues?.name ?? 'Lieu',
    venueLat: r.venues?.lat ?? null,
    venueLng: r.venues?.lng ?? null,
    hostId: r.host_id,
    hostName: r.host?.display_name ?? 'Joueur',
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    format: (r.format as SlotFormat) ?? '3sets',
    levelMin: r.level_min,
    levelMax: r.level_max,
    participants: (r.slot_participants ?? []).map((p) => ({
      id: p.player_id,
      name: p.players?.display_name ?? 'Joueur',
      elo: p.players?.elo ?? 0,
    })),
  };
}

/** Créneaux à venir d'un lieu. */
export async function fetchSlotsForVenue(venueId: string): Promise<Slot[]> {
  const { data } = await supabase
    .from('slots')
    .select(SELECT)
    .eq('venue_id', venueId)
    .eq('status', 'open')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at');
  return ((data as unknown as Row[] | null) ?? []).map(mapRow);
}

/** Tous les créneaux à venir (pour la Carte). */
export async function fetchUpcomingSlots(limit = 20): Promise<Slot[]> {
  const { data } = await supabase
    .from('slots')
    .select(SELECT)
    .eq('status', 'open')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit);
  return ((data as unknown as Row[] | null) ?? []).map(mapRow);
}

export async function createSlot(p: {
  venueId: string;
  hostId: string;
  startsAt: string;
  endsAt: string;
  format: SlotFormat;
  levelMin: number | null;
  levelMax: number | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('slots')
    .insert({
      venue_id: p.venueId,
      host_id: p.hostId,
      starts_at: p.startsAt,
      ends_at: p.endsAt,
      format: p.format,
      level_min: p.levelMin,
      level_max: p.levelMax,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function joinSlot(slotId: string, myId: string): Promise<void> {
  const { error } = await supabase.from('slot_participants').insert({ slot_id: slotId, player_id: myId });
  if (error) throw error;
}

export async function leaveSlot(slotId: string, myId: string): Promise<void> {
  const { error } = await supabase.from('slot_participants').delete().eq('slot_id', slotId).eq('player_id', myId);
  if (error) throw error;
}

// ── helpers d'affichage ──
export const FORMAT_LABEL: Record<SlotFormat, string> = {
  ntt: 'NTT',
  '3sets': '3 sets gagnants',
  '2sets': '2 sets gagnants',
};

export function levelLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Tous niveaux';
  if (min != null && max != null) return `ELO ${min}–${max}`;
  if (min != null) return `ELO ${min}+`;
  return `ELO ≤ ${max}`;
}

export function slotTimeLabel(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${t(s)} → ${t(e)}`;
}
