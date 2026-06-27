import { supabase } from '@/lib/supabase/client';

export type ChallengeFormat = 'wtt' | 'bo7' | 'bo5' | 'bo3' | 'champions';

export type Challenge = {
  id: string;
  from_player: string;
  to_player: string;
  message: string | null;
  status: string;
  format: string | null;
  created_at: string;
  from: { display_name: string } | null;
  to: { display_name: string } | null;
};

/** Nombre de sets (best_of) associé à un format de défi. */
export function bestOfForFormat(format: ChallengeFormat): number {
  if (format === 'bo3') return 3;
  if (format === 'bo5') return 5;
  return 7; // bo7 | wtt | champions
}

export type RecentOpponent = { id: string; name: string; elo: number; city: string | null; lastPlayed: string };

const CHALLENGE_COLS =
  'id, from_player, to_player, message, status, format, created_at, from:from_player(display_name), to:to_player(display_name)';

export async function fetchIncomingChallenges(myId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLS)
    .eq('to_player', myId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  return (data as unknown as Challenge[] | null) ?? [];
}

/** Défis que J'AI envoyés (tous statuts), pour la section « Défis en cours ». */
export async function fetchOutgoingChallenges(myId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLS)
    .eq('from_player', myId)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data as unknown as Challenge[] | null) ?? [];
}

export async function sendChallenge(
  fromId: string,
  toId: string,
  format: ChallengeFormat = 'wtt',
  message?: string,
): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .insert({ from_player: fromId, to_player: toId, format, message: message ?? null, status: 'sent' });
  if (error) throw error;
}

export async function respondChallenge(id: string, status: 'accepted' | 'declined'): Promise<void> {
  const { error } = await supabase.from('challenges').update({ status }).eq('id', id);
  if (error) throw error;
}

type MatchRow = {
  player_a: string;
  player_b: string;
  played_at: string;
  a: { display_name: string; elo: number; city: string | null } | null;
  b: { display_name: string; elo: number; city: string | null } | null;
};

/** Adversaires récents (depuis mes matchs confirmés), dédupliqués, plus récent d'abord. */
export async function fetchRecentOpponents(myId: string, limit = 6): Promise<RecentOpponent[]> {
  const { data } = await supabase
    .from('matches')
    .select('player_a, player_b, played_at, a:player_a(display_name, elo, city), b:player_b(display_name, elo, city)')
    .eq('status', 'confirmed')
    .order('played_at', { ascending: false })
    .limit(40);
  const rows = (data as unknown as MatchRow[] | null) ?? [];
  const seen = new Set<string>();
  const out: RecentOpponent[] = [];
  for (const r of rows) {
    const iAmA = r.player_a === myId;
    const oppId = iAmA ? r.player_b : r.player_a;
    const opp = iAmA ? r.b : r.a;
    if (!oppId || oppId === myId || seen.has(oppId)) continue;
    seen.add(oppId);
    out.push({ id: oppId, name: opp?.display_name ?? 'Joueur', elo: opp?.elo ?? 0, city: opp?.city ?? null, lastPlayed: r.played_at });
    if (out.length >= limit) break;
  }
  return out;
}

/** ELO en jeu (Glicko) contre un adversaire : gain si victoire / perte si défaite. */
export async function challengePreview(opponentId: string): Promise<{ winDelta: number; lossDelta: number }> {
  const { data } = await supabase.rpc('glicko_preview', { p_opponent: opponentId });
  const row = (data as { win_delta: number; loss_delta: number }[] | null)?.[0];
  return { winDelta: row?.win_delta ?? 0, lossDelta: row?.loss_delta ?? 0 };
}

export const FORMAT_INFO: Record<ChallengeFormat, { title: string; tag: string; detail: string }> = {
  wtt: { title: 'WTT', tag: 'Format officiel', detail: 'Meilleur des 7 sets' },
  bo7: { title: 'BO7', tag: 'Marathon', detail: 'Meilleur des 7 sets' },
  bo5: { title: 'BO5', tag: 'Classique', detail: 'Meilleur des 5 sets' },
  bo3: { title: 'BO3', tag: 'Rapide', detail: 'Meilleur des 3 sets' },
  champions: { title: 'Champions League', tag: 'Spécial', detail: 'Format à élimination' },
};
