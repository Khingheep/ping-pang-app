import { type User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export type PlayerProfile = {
  id: string;
  handle: string;
  display_name: string;
  city: string | null;
  elo: number;
  level: string;
  is_premium: boolean;
};

export type LeaderboardEntry = {
  id: string;
  handle: string;
  display_name: string;
  city: string | null;
  elo: number;
  level: string;
};

const LIST_COLS = 'id, handle, display_name, city, elo, level';

function handleFromUser(user: User): string {
  const base = (user.email?.split('@')[0] ?? 'joueur').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return base || 'joueur';
}

/** Garantit qu'une ligne `players` existe pour ce user (créée à la 1re connexion). */
export async function ensurePlayerProfile(user: User): Promise<void> {
  const handle = handleFromUser(user);
  const display_name = (user.user_metadata?.display_name as string | undefined) ?? handle;
  await supabase
    .from('players')
    .upsert({ id: user.id, handle, display_name }, { onConflict: 'id', ignoreDuplicates: true });
}

/** Profil joueur courant (ou null). */
export async function fetchMyProfile(userId: string): Promise<PlayerProfile | null> {
  const { data } = await supabase
    .from('players')
    .select('id, handle, display_name, city, elo, level, is_premium')
    .eq('id', userId)
    .maybeSingle();
  return (data as PlayerProfile | null) ?? null;
}

/** Classement par ELO décroissant. */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from('players')
    .select(LIST_COLS)
    .order('elo', { ascending: false })
    .limit(limit);
  return (data as LeaderboardEntry[] | null) ?? [];
}

/** Autres joueurs (pour les défis), hors soi-même. */
export async function fetchOtherPlayers(excludeId: string, limit = 50): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from('players')
    .select(LIST_COLS)
    .neq('id', excludeId)
    .order('elo', { ascending: false })
    .limit(limit);
  return (data as LeaderboardEntry[] | null) ?? [];
}
