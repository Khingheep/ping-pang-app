import { useQuery } from '@tanstack/react-query';
import { type User } from '@supabase/supabase-js';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { fetchVenue, type Venue } from '@/lib/venues/venues';

export type PlayerProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  play_style: string | null;
  handedness: string | null;
  player_type: string | null;
  fftt_id: string | null;
  fftt_points: number | null;
  fftt_club: string | null;
  elo: number;
  glicko_rd: number | null; // incertitude Glicko-2 (RD élevé = classement provisoire)
  goal_elo: number | null; // objectif d'ELO fixé manuellement (null = aucun)
  goal_start_elo: number | null; // ELO au moment où l'objectif a été posé (base de la progression)
  goal_deadline: string | null; // 1er du mois cible (ISO date) ou null
  weekly_goal_min: number | null; // objectif hebdo d'entraînement (min) ; null = défaut app (3h)
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
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  elo: number;
  level: string;
  lat: number | null;
  lng: number | null;
};

/** Ligne de classement enrichie de la variation d'ELO sur la période (RPC leaderboard_ranked). */
export type RankedEntry = LeaderboardEntry & { delta: number };

const LIST_COLS = 'id, handle, display_name, avatar_url, city, country, elo, level, lat, lng';

function handleFromUser(user: User): string {
  const base = (user.email?.split('@')[0] ?? 'joueur').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return base || 'joueur';
}

/** Garantit qu'une ligne `players` existe pour ce user (créée à la 1re connexion). */
export async function ensurePlayerProfile(user: User): Promise<void> {
  const base = handleFromUser(user);
  const display_name = (user.user_metadata?.display_name as string | undefined) ?? base;
  const { error } = await supabase
    .from('players')
    .upsert({ id: user.id, handle: base, display_name }, { onConflict: 'id', ignoreDuplicates: true });
  // `handle` déjà pris par une autre licence → suffixe dérivé de l'id pour garantir l'unicité.
  if (error?.code === '23505') {
    await supabase
      .from('players')
      .upsert({ id: user.id, handle: `${base}-${user.id.slice(0, 4)}`, display_name }, { onConflict: 'id', ignoreDuplicates: true });
  }
}

/** Profil joueur courant (ou null). */
export async function fetchMyProfile(userId: string): Promise<PlayerProfile | null> {
  const { data } = await supabase
    .from('players')
    .select(
      'id, handle, display_name, avatar_url, bio, city, country, play_style, handedness, player_type, fftt_id, fftt_points, fftt_club, elo, glicko_rd, goal_elo, goal_start_elo, goal_deadline, weekly_goal_min, level, is_premium, onboarded, profile_public, stats_visible, visible_on_map, share_elo, notif_challenges, notif_results',
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
    fftt_club?: string | null;
    elo?: number;
    level?: string;
  },
): Promise<void> {
  const base = (email.split('@')[0] ?? 'joueur').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'joueur';
  const extras: Record<string, unknown> = {};
  if (patch.elo !== undefined) {
    extras.glicko_rating = patch.elo;
    if (patch.fftt_points != null) extras.glicko_rd = 100;
  }
  const buildRow = (handle: string): Record<string, unknown> => ({ id: userId, handle, onboarded: true, ...patch, ...extras });

  let { error } = await supabase.from('players').upsert(buildRow(base), { onConflict: 'id' });
  // `handle` est UNIQUE : si une autre licence l'a déjà pris (collision sur le préfixe d'email),
  // on retente avec un suffixe dérivé de l'id pour garantir l'unicité.
  if (error?.code === '23505') {
    const alt = `${base}-${userId.slice(0, 4)}`;
    ({ error } = await supabase.from('players').upsert(buildRow(alt), { onConflict: 'id' }));
  }
  if (error) throw error;
}

/**
 * Club « maison » du joueur (venue lié via home_venue_id). Lecture défensive : renvoie null
 * sans planter si la colonne n'existe pas encore (migration 0047 non appliquée).
 */
export async function fetchHomeVenue(userId: string): Promise<Venue | null> {
  const { data, error } = await supabase.from('players').select('home_venue_id').eq('id', userId).maybeSingle();
  if (error) return null;
  const vid = (data as { home_venue_id: string | null } | null)?.home_venue_id ?? null;
  return vid ? fetchVenue(vid) : null;
}

/** Définit (ou retire) le club maison. Écriture isolée → ne casse aucun autre flux si elle échoue. */
export async function setHomeVenue(userId: string, venueId: string | null): Promise<void> {
  const { error } = await supabase.from('players').update({ home_venue_id: venueId }).eq('id', userId);
  if (error) throw error;
}

/** Mémorise la dernière position connue du joueur (pour « Joueurs près de toi »). */
export async function updateMyLocation(userId: string, coords: { lat: number; lng: number }): Promise<void> {
  await supabase.from('players').update({ lat: coords.lat, lng: coords.lng }).eq('id', userId);
}

/** Met à jour les préférences (confidentialité / notifications). */
export async function updatePrefs(userId: string, patch: Partial<AccountPrefs>): Promise<void> {
  const { error } = await supabase.from('players').update(patch).eq('id', userId);
  if (error) throw error;
}

/** Fixe l'objectif hebdomadaire d'entraînement (minutes). null = revient au défaut app. */
export async function updateWeeklyGoal(userId: string, min: number | null): Promise<void> {
  const { error } = await supabase.from('players').update({ weekly_goal_min: min }).eq('id', userId);
  if (error) throw error;
}

/** Met à jour son propre profil (RLS : auth.uid() = id). */
export async function updateMyProfile(
  userId: string,
  patch: {
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    city?: string;
    country?: string;
    play_style?: string;
    handedness?: string;
    player_type?: string;
    interests?: string[];
    fftt_id?: string;
    fftt_points?: number | null;
    fftt_club?: string | null;
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

/**
 * Fixe (ou retire) l'objectif d'ELO manuel. À la création, on fige `goal_start_elo`
 * sur l'ELO courant pour que la progression parte de là. `null` partout = on retire.
 */
export async function updateMyGoal(
  userId: string,
  goal: { goalElo: number; goalDeadline: string | null; currentElo: number } | null,
): Promise<void> {
  const patch = goal
    ? { goal_elo: goal.goalElo, goal_start_elo: goal.currentElo, goal_deadline: goal.goalDeadline }
    : { goal_elo: null, goal_start_elo: null, goal_deadline: null };
  const { error } = await supabase.from('players').update(patch).eq('id', userId);
  if (error) throw error;
}

/**
 * Delta d'ELO du joueur courant sur `days` jours, calculé SERVEUR sur l'historique de rating
 * (= elo actuel − elo il y a `days` jours). Fiable, contrairement à la somme des elo_delta des
 * matchs qui peut diverger du rating réel (arrondis Glicko, lien FFTT, seed…). Renvoie 0 en cas
 * d'erreur ou d'historique insuffisant.
 */
export async function fetchEloDelta(days = 7): Promise<number> {
  const { data, error } = await supabase.rpc('elo_delta_since', { p_days: days });
  if (error) return 0;
  return (data as number | null) ?? 0;
}

/**
 * Classement par ELO décroissant + variation d'ELO de chaque joueur sur `days` jours
 * (indicateur de tendance ▲/▼ dans l'écran Ranking). Calcul serveur sur `rating_history`.
 */
export async function fetchLeaderboard(limit = 200, days = 7): Promise<RankedEntry[]> {
  const { data, error } = await supabase.rpc('leaderboard_ranked', { p_limit: limit, p_days: days });
  if (error || !data) return [];
  return data as RankedEntry[];
}

/** Autres joueurs (pour les défis), hors soi-même. */
export async function fetchOtherPlayers(excludeId: string, limit = 50): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from('players')
    .select(LIST_COLS)
    .eq('is_guest', false) // masque les invités de tournoi
    .neq('id', excludeId)
    .order('elo', { ascending: false })
    .limit(limit);
  return (data as LeaderboardEntry[] | null) ?? [];
}

/** Résultat minimal d'une recherche de joueur (pour démarrer une conversation). */
export type PlayerSearchResult = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * Recherche de joueurs par nom ou handle (hors soi-même), pour démarrer un message.
 * Insensible à la casse ; renvoie [] si la requête est vide.
 */
export async function searchPlayers(myId: string, query: string, limit = 20): Promise<PlayerSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  // Échappe les jokers PostgREST (% et _) pour qu'ils soient traités littéralement.
  const pattern = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from('players')
    .select('id, display_name, avatar_url')
    .neq('id', myId)
    .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
    .order('display_name', { ascending: true })
    .limit(limit);
  const rows = (data as { id: string; display_name: string | null; avatar_url: string | null }[] | null) ?? [];
  return rows.map((r) => ({ id: r.id, name: r.display_name ?? 'Joueur', avatarUrl: r.avatar_url }));
}

// ───────────────────────── Hooks react-query ─────────────────────────

/** Profil joueur (mis en cache). Désactivé tant que l'id n'est pas connu. */
export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? 'anon'),
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
    staleTime: STALE.profile,
  });
}

/** Delta d'ELO sur `days` jours (mis en cache). Désactivé tant que l'id n'est pas connu. */
export function useEloDelta(userId: string | undefined, days = 7) {
  return useQuery({
    queryKey: qk.eloDelta(userId ?? 'anon', days),
    queryFn: () => fetchEloDelta(days),
    enabled: !!userId,
    staleTime: STALE.leaderboard,
  });
}

/** Classement par ELO + variation sur `days` jours (mis en cache). */
export function useLeaderboard(limit = 200, days = 7) {
  return useQuery({
    queryKey: qk.leaderboard(),
    queryFn: () => fetchLeaderboard(limit, days),
    staleTime: STALE.leaderboard,
  });
}

/** Autres joueurs pour les défis, hors soi-même (mis en cache). */
export function useOtherPlayers(excludeId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: qk.otherPlayers(excludeId ?? 'anon'),
    queryFn: () => fetchOtherPlayers(excludeId!, limit),
    enabled: !!excludeId,
    staleTime: STALE.players,
  });
}

/** Club « maison » du joueur (mis en cache). */
export function useHomeVenue(userId: string | undefined) {
  return useQuery({
    queryKey: qk.venues.home(userId ?? 'anon'),
    queryFn: () => fetchHomeVenue(userId!),
    enabled: !!userId,
    staleTime: STALE.venues,
  });
}
