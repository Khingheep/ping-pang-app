import { type User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export type PlayerProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  play_style: string | null;
  handedness: string | null;
  player_type: string | null;
  fftt_id: string | null;
  fftt_points: number | null;
  elo: number;
  glicko_rd: number | null; // incertitude Glicko-2 (RD élevé = classement provisoire)
  level: string;
  is_premium: boolean;
  onboarded: boolean;
  profile_public: boolean;
  stats_visible: boolean;
  visible_on_map: boolean;
  share_elo: boolean;
  notif_challenges: boolean;
  notif_results: boolean;
};

export type AccountPrefs = Pick<
  PlayerProfile,
  'profile_public' | 'stats_visible' | 'visible_on_map' | 'share_elo' | 'notif_challenges' | 'notif_results'
>;

export type LeaderboardEntry = {
  id: string;
  handle: string;
  display_name: string;
  city: string | null;
  country: string | null;
  elo: number;
  level: string;
};

const LIST_COLS = 'id, handle, display_name, city, country, elo, level';

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
    .select(
      'id, handle, display_name, avatar_url, city, country, play_style, handedness, player_type, fftt_id, fftt_points, elo, glicko_rd, level, is_premium, onboarded, profile_public, stats_visible, visible_on_map, share_elo, notif_challenges, notif_results',
    )
    .eq('id', userId)
    .maybeSingle();
  return (data as PlayerProfile | null) ?? null;
}

/**
 * Crée (ou met à jour) la ligne joueur en fin d'onboarding. Robuste au cas où la ligne
 * n'existe pas encore (inscription tout juste faite). Marque `onboarded = true`.
 */
export async function upsertOnboarding(
  userId: string,
  email: string,
  patch: {
    display_name: string;
    avatar_url?: string;
    city?: string;
    country?: string;
    player_type?: string;
    interests?: string[];
    fftt_id?: string;
    fftt_points?: number | null;
    elo?: number;
    level?: string;
  },
): Promise<void> {
  const handle = (email.split('@')[0] ?? 'joueur').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'joueur';
  const row: Record<string, unknown> = { id: userId, handle, onboarded: true, ...patch };
  if (patch.elo !== undefined) {
    row.glicko_rating = patch.elo;
    if (patch.fftt_points != null) row.glicko_rd = 100;
  }
  const { error } = await supabase.from('players').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/** Met à jour les préférences (confidentialité / notifications). */
export async function updatePrefs(userId: string, patch: Partial<AccountPrefs>): Promise<void> {
  const { error } = await supabase.from('players').update(patch).eq('id', userId);
  if (error) throw error;
}

/** Met à jour son propre profil (RLS : auth.uid() = id). */
export async function updateMyProfile(
  userId: string,
  patch: {
    display_name?: string;
    avatar_url?: string;
    city?: string;
    country?: string;
    play_style?: string;
    handedness?: string;
    player_type?: string;
    interests?: string[];
    fftt_id?: string;
    fftt_points?: number | null;
    elo?: number;
    level?: string;
    onboarded?: boolean;
  },
): Promise<void> {
  // Quand on fixe l'ELO (lien FFTT à l'onboarding), on aligne le rating Glicko pour éviter
  // une discontinuité au 1er match. Un classement FFTT est un prior fiable → RD plus bas.
  const finalPatch: Record<string, unknown> = { ...patch };
  if (patch.elo !== undefined) {
    finalPatch.glicko_rating = patch.elo;
    if (patch.fftt_points != null) finalPatch.glicko_rd = 100;
  }
  const { error } = await supabase.from('players').update(finalPatch).eq('id', userId);
  if (error) throw error;
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
