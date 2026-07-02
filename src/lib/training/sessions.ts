import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImageManipulator from 'expo-image-manipulator';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

/** Nombre max de photos par séance. */
export const MAX_SESSION_PHOTOS = 4;

export const STROKES = [
  'Coup droit',
  'Revers',
  'Technique de déplacement',
  'Service',
  'Remise de service',
  'Bloc coup droit',
  'Bloc revers',
  'Poussette',
  'Contre topspin coup droit',
  'Contre topspin revers',
  'Vitesse de déplacement',
  'Réactivité',
  'Toucher de balle',
  'Lecture de jeu',
  'Flip coup droit',
  'Flip revers',
  'Défense coup droit',
  'Défense revers',
  'Top sur top',
];

/** Nombre de coups affichés avant le bouton « Voir tout ». */
export const STROKES_PREVIEW_COUNT = 6;
export const PARTNER_LEVELS = ['Débutant', 'Mon niveau', 'Meilleur que moi'];
export const FEELINGS = ['Difficile', 'Moyen', 'Bien', 'Excellent'];

export type SessionPartner = { id: string; name: string; avatarUrl: string | null };

export type TrainingSession = {
  id: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  strokes: string[];
  partner_level: string | null;
  partner: SessionPartner | null;
  venue: { name: string } | null;
  created_at: string;
};

export type StrokeStat = { stroke: string; min: number };

/** Granularité du graphe d'activité : jours de la semaine, semaines du mois, mois de l'année. */
export type ActivityPeriod = 'week' | 'month' | 'year';
export type ActivityBucket = { label: string; min: number };

export type TrainingStats = {
  totalMinYear: number;
  weekMin: number;
  monthMin: number;
  count: number;
  byStroke: StrokeStat[];
  weekly: { label: string; min: number }[];
  /** Séries pré-calculées pour le filtre Semaine / Mois / Année du graphe d'activité. */
  activity: Record<ActivityPeriod, ActivityBucket[]>;
};

export async function addTrainingSession(p: {
  playerId: string;
  durationMin: number;
  strokes: string[];
  partnerLevel?: string | null;
  partnerId?: string | null;
  venueId?: string | null;
  venueLabel?: string | null;
  feeling?: string | null;
  note?: string | null;
  photoUrls?: string[] | null;
  isSolo?: boolean;
}): Promise<void> {
  const photos = p.photoUrls ?? [];
  const { error } = await supabase.from('training_sessions').insert({
    player_id: p.playerId,
    duration_min: p.durationMin,
    strokes: p.strokes,
    partner_level: p.partnerLevel ?? null,
    partner_id: p.partnerId ?? null,
    venue_id: p.venueId ?? null,
    venue_label: p.venueLabel ?? null,
    feeling: p.feeling ?? null,
    note: p.note ?? null,
    photo_urls: photos,
    photo_url: photos[0] ?? null, // rétrocompat : anciens clients lisent encore photo_url
    is_solo: p.isSolo ?? false,
  });
  if (error) throw error;
}

/**
 * Compresse une photo avant l'upload : redimensionne à 1280px max de large puis
 * ré-encode en JPEG qualité 0.6. Gain d'espace ~80% vs l'original (le picker ne
 * redimensionne pas, il ne fait que baisser la qualité).
 */
async function compressPhoto(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1280 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

/** Upload une photo de séance (chemin <userId>/<key>.jpg) et renvoie l'URL publique. */
export async function uploadSessionPhoto(userId: string, uri: string, key: string): Promise<string> {
  const compressed = await compressPhoto(uri);
  const res = await fetch(compressed);
  const buf = await res.arrayBuffer();
  const path = `${userId}/${key}.jpg`;
  const { error } = await supabase.storage
    .from('session-photos')
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('session-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Compresse + upload plusieurs photos en parallèle, en conservant l'ordre.
 * Une photo qui échoue est ignorée (la séance reste enregistrable).
 */
export async function uploadSessionPhotos(userId: string, uris: string[]): Promise<string[]> {
  const results = await Promise.all(
    uris.map(async (uri, i) => {
      try {
        return await uploadSessionPhoto(userId, uri, `${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`);
      } catch {
        return null;
      }
    }),
  );
  return results.filter((u): u is string => !!u);
}

// ───────────────────────── Feed social (séances de tout le monde) ─────────────────────────

export type SessionFeedItem = {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  durationMin: number;
  feeling: string | null;
  note: string | null;
  strokes: string[];
  photoUrls: string[];
  isSolo: boolean;
  venueName: string | null;
  partner: SessionPartner | null;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  commentCount: number;
};

/** Un joueur qui a aimé une séance (pour l'écran « Aimé par »). */
export type SessionLiker = { id: string; name: string; avatarUrl: string | null; createdAt: string };

/** Un commentaire sur une séance. */
export type SessionComment = {
  id: string;
  author: { id: string; name: string; avatarUrl: string | null };
  body: string;
  createdAt: string;
};

type FeedRow = {
  id: string;
  player_id: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  strokes: string[] | null;
  photo_url: string | null;
  photo_urls: string[] | null;
  is_solo: boolean | null;
  created_at: string;
  venue_label: string | null;
  players: { display_name: string; avatar_url: string | null } | null;
  partner: { id: string; display_name: string | null; avatar_url: string | null } | null;
  venues: { name: string } | null;
};

/** Feed global des séances (tous les joueurs), avec compteur de likes et mon état de like. */
export async function fetchSessionsFeed(myId: string | undefined, limit = 40): Promise<SessionFeedItem[]> {
  const { data } = await supabase
    .from('training_sessions')
    .select(
      // `players!...fkey` désambiguïse : training_sessions a 2 FK vers players (auteur + partenaire).
      'id, player_id, duration_min, feeling, note, strokes, photo_url, photo_urls, is_solo, created_at, venue_label, players!training_sessions_player_id_fkey(display_name, avatar_url), partner:players!training_sessions_partner_id_fkey(id, display_name, avatar_url), venues(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = (data as unknown as FeedRow[] | null) ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: likeData }, { data: commentData }] = await Promise.all([
    supabase.from('session_likes').select('session_id, player_id').in('session_id', ids),
    supabase.from('session_comments').select('session_id').in('session_id', ids),
  ]);
  const likes = (likeData as { session_id: string; player_id: string }[] | null) ?? [];
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const l of likes) {
    counts.set(l.session_id, (counts.get(l.session_id) ?? 0) + 1);
    if (l.player_id === myId) mine.add(l.session_id);
  }
  const commentCounts = new Map<string, number>();
  for (const c of (commentData as { session_id: string }[] | null) ?? []) {
    commentCounts.set(c.session_id, (commentCounts.get(c.session_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    author: { id: r.player_id, name: r.players?.display_name ?? 'Joueur', avatarUrl: r.players?.avatar_url ?? null },
    durationMin: r.duration_min,
    feeling: r.feeling,
    note: r.note,
    strokes: r.strokes ?? [],
    photoUrls: r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [],
    isSolo: r.is_solo ?? false,
    venueName: r.venues?.name ?? r.venue_label ?? null,
    partner: r.partner
      ? { id: r.partner.id, name: r.partner.display_name ?? 'Joueur', avatarUrl: r.partner.avatar_url }
      : null,
    createdAt: r.created_at,
    likeCount: counts.get(r.id) ?? 0,
    liked: mine.has(r.id),
    commentCount: commentCounts.get(r.id) ?? 0,
  }));
}

/** Une séance unique (pour l'écran détail « Publication »). */
export async function fetchSessionItem(sessionId: string, myId: string | undefined): Promise<SessionFeedItem | null> {
  const { data } = await supabase
    .from('training_sessions')
    .select(
      'id, player_id, duration_min, feeling, note, strokes, photo_url, photo_urls, is_solo, created_at, venue_label, players!training_sessions_player_id_fkey(display_name, avatar_url), partner:players!training_sessions_partner_id_fkey(id, display_name, avatar_url), venues(name)',
    )
    .eq('id', sessionId)
    .maybeSingle();
  const r = data as unknown as FeedRow | null;
  if (!r) return null;
  const [{ data: likeData }, { count: commentCount }] = await Promise.all([
    supabase.from('session_likes').select('player_id').eq('session_id', sessionId),
    supabase.from('session_comments').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
  ]);
  const likes = (likeData as { player_id: string }[] | null) ?? [];
  return {
    id: r.id,
    author: { id: r.player_id, name: r.players?.display_name ?? 'Joueur', avatarUrl: r.players?.avatar_url ?? null },
    durationMin: r.duration_min,
    feeling: r.feeling,
    note: r.note,
    strokes: r.strokes ?? [],
    photoUrls: r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [],
    isSolo: r.is_solo ?? false,
    venueName: r.venues?.name ?? r.venue_label ?? null,
    partner: r.partner
      ? { id: r.partner.id, name: r.partner.display_name ?? 'Joueur', avatarUrl: r.partner.avatar_url }
      : null,
    createdAt: r.created_at,
    likeCount: likes.length,
    liked: !!myId && likes.some((l) => l.player_id === myId),
    commentCount: commentCount ?? 0,
  };
}

/** Liste des joueurs qui ont aimé une séance (les plus récents d'abord). */
export async function fetchSessionLikers(sessionId: string): Promise<SessionLiker[]> {
  const { data } = await supabase
    .from('session_likes')
    .select('created_at, players!session_likes_player_id_fkey(id, display_name, avatar_url)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
  type LikerRow = { created_at: string; players: { id: string; display_name: string; avatar_url: string | null } | null };
  return ((data as unknown as LikerRow[] | null) ?? [])
    .filter((r) => r.players)
    .map((r) => ({
      id: r.players!.id,
      name: r.players!.display_name ?? 'Joueur',
      avatarUrl: r.players!.avatar_url ?? null,
      createdAt: r.created_at,
    }));
}

/** Commentaires d'une séance (les plus anciens d'abord, ordre de lecture). */
export async function fetchSessionComments(sessionId: string): Promise<SessionComment[]> {
  const { data } = await supabase
    .from('session_comments')
    .select('id, body, created_at, players!session_comments_player_id_fkey(id, display_name, avatar_url)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  type CommentRow = {
    id: string;
    body: string;
    created_at: string;
    players: { id: string; display_name: string; avatar_url: string | null } | null;
  };
  return ((data as unknown as CommentRow[] | null) ?? []).map((r) => ({
    id: r.id,
    author: { id: r.players?.id ?? '', name: r.players?.display_name ?? 'Joueur', avatarUrl: r.players?.avatar_url ?? null },
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addSessionComment(sessionId: string, playerId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('session_comments')
    .insert({ session_id: sessionId, player_id: playerId, body: body.trim() });
  if (error) throw error;
}

export async function likeSession(sessionId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('session_likes').insert({ session_id: sessionId, player_id: playerId });
  if (error && error.code !== '23505') throw error; // 23505 = déjà liké → idempotent, pas une erreur
}

export async function unlikeSession(sessionId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('session_likes').delete().eq('session_id', sessionId).eq('player_id', playerId);
  if (error) throw error;
}

/** Stats d'entraînement d'un joueur (mis en cache). */
export function useTrainingStats(playerId: string | undefined) {
  return useQuery({
    queryKey: qk.training.stats(playerId ?? 'anon'),
    queryFn: () => fetchTrainingStats(playerId!),
    enabled: !!playerId,
    staleTime: STALE.trainingStats,
  });
}

/** Dernière séance d'un joueur (mis en cache), ou null. */
export function useLastTrainingSession(playerId: string | undefined) {
  return useQuery({
    queryKey: qk.training.lastSession(playerId ?? 'anon'),
    queryFn: async () => (await fetchTrainingSessions(playerId!, 1))[0] ?? null,
    enabled: !!playerId,
    staleTime: STALE.trainingStats,
  });
}

/** Feed des séances (mis en cache). */
export function useSessionsFeed(myId: string | undefined, limit = 40) {
  return useQuery({
    queryKey: qk.feed.sessions(myId ?? 'anon'),
    queryFn: () => fetchSessionsFeed(myId, limit),
    enabled: !!myId,
    staleTime: STALE.feed,
  });
}

/** Like/unlike optimiste d'une séance du feed : met à jour le cache, rollback en cas d'échec. */
export function useToggleSessionLike(myId: string) {
  const qc = useQueryClient();
  const key = qk.feed.sessions(myId);
  return useMutation({
    mutationFn: async (item: SessionFeedItem) => {
      const liked = !item.liked;
      if (liked) await likeSession(item.id, myId);
      else await unlikeSession(item.id, myId);
      return liked;
    },
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SessionFeedItem[]>(key);
      const liked = !item.liked;
      qc.setQueryData<SessionFeedItem[]>(key, (old) =>
        (old ?? []).map((s) => (s.id === item.id ? { ...s, liked, likeCount: s.likeCount + (liked ? 1 : -1) } : s)),
      );
      return { prev };
    },
    onError: (_e, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}

type Row = {
  id: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  strokes: string[] | null;
  partner_level: string | null;
  partner: { id: string; display_name: string | null; avatar_url: string | null } | null;
  venues: { name: string } | null;
  venue_label: string | null;
  created_at: string;
};

export async function fetchTrainingSessions(playerId: string, limit = 100): Promise<TrainingSession[]> {
  const { data } = await supabase
    .from('training_sessions')
    .select(
      'id, duration_min, feeling, note, strokes, partner_level, partner:players!training_sessions_partner_id_fkey(id, display_name, avatar_url), venues(name), venue_label, created_at',
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data as unknown as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    duration_min: r.duration_min,
    feeling: r.feeling,
    note: r.note,
    strokes: r.strokes ?? [],
    partner_level: r.partner_level,
    partner: r.partner
      ? { id: r.partner.id, name: r.partner.display_name ?? 'Joueur', avatarUrl: r.partner.avatar_url }
      : null,
    venue: r.venues ?? (r.venue_label ? { name: r.venue_label } : null),
    created_at: r.created_at,
  }));
}

// ───────────────────────── Modèles « répéter une séance » ─────────────────────────

/** Une séance passée réduite à ce qu'il faut pour pré-remplir le formulaire. */
export type SessionTemplate = {
  id: string; // id de la séance source (sert de clé React)
  durationMin: number;
  strokes: string[];
  isSolo: boolean;
  partnerLevel: string | null;
  partner: SessionPartner | null;
  venueId: string | null;
  venueName: string | null; // nom à afficher + repli en lieu libre si le lieu n'est plus en base
  feeling: string | null;
};

type TemplateRow = {
  id: string;
  duration_min: number;
  strokes: string[] | null;
  is_solo: boolean | null;
  partner_level: string | null;
  partner_id: string | null;
  venue_id: string | null;
  feeling: string | null;
  partner: { id: string; display_name: string | null; avatar_url: string | null } | null;
  venues: { name: string } | null;
  venue_label: string | null;
};

/** Signature d'une séance : deux séances « identiques » partagent la même config. */
function templateKey(t: SessionTemplate): string {
  const strokes = [...t.strokes].sort().join(',');
  const partner = t.partner?.id ?? t.partnerLevel ?? '';
  const venue = t.venueId ?? t.venueName ?? '';
  return `${t.durationMin}|${strokes}|${partner}|${venue}|${t.isSolo ? 's' : 'd'}`;
}

/**
 * Mes dernières configs de séance distinctes, pour le raccourci « répéter une séance ».
 * On lit large puis on dédoublonne (mêmes coups/durée/partenaire/lieu) en gardant la plus récente.
 */
export async function fetchSessionTemplates(playerId: string, limit = 3): Promise<SessionTemplate[]> {
  const { data } = await supabase
    .from('training_sessions')
    .select(
      'id, duration_min, strokes, is_solo, partner_level, partner_id, venue_id, feeling, partner:players!training_sessions_partner_id_fkey(id, display_name, avatar_url), venues(name), venue_label, created_at',
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (data as unknown as TemplateRow[] | null) ?? [];

  const out: SessionTemplate[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t: SessionTemplate = {
      id: r.id,
      durationMin: r.duration_min,
      strokes: r.strokes ?? [],
      isSolo: r.is_solo ?? false,
      partnerLevel: r.partner_level,
      partner: r.partner
        ? { id: r.partner.id, name: r.partner.display_name ?? 'Joueur', avatarUrl: r.partner.avatar_url }
        : null,
      venueId: r.venue_id,
      venueName: r.venues?.name ?? r.venue_label ?? null,
      feeling: r.feeling,
    };
    const key = templateKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

const DAY_MS = 86_400_000;
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export async function fetchTrainingStats(playerId: string): Promise<TrainingStats> {
  const now = new Date();
  const yearStartDate = new Date(now.getFullYear(), 0, 1);

  // Graphe historique « 8 dernières semaines » : il peut déborder sur l'an passé en début
  // d'année, donc on lit depuis la plus ancienne borne nécessaire (et non gte 1er janvier).
  const WEEKS = 8;
  const oldestWeek = startOfWeek(now);
  oldestWeek.setDate(oldestWeek.getDate() - (WEEKS - 1) * 7);
  const fetchFrom = new Date(Math.min(yearStartDate.getTime(), oldestWeek.getTime()));

  const { data } = await supabase
    .from('training_sessions')
    .select('duration_min, strokes, created_at')
    .eq('player_id', playerId)
    .gte('created_at', fetchFrom.toISOString());
  const rows = (data as { duration_min: number; strokes: string[] | null; created_at: string }[] | null) ?? [];

  const weekStart = startOfWeek(now).getTime();
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const ws = startOfWeek(now);
    ws.setDate(ws.getDate() - (WEEKS - 1 - i) * 7);
    return { start: ws.getTime(), label: `${ws.getDate()}/${ws.getMonth() + 1}`, min: 0 };
  });

  // ── Séries du filtre Semaine / Mois / Année ──
  // Semaine : 7 jours de la semaine en cours (lundi -> dimanche).
  const week = Array.from({ length: 7 }, (_, i) => ({
    start: weekStart + i * DAY_MS,
    label: DAY_LABELS[i],
    min: 0,
  }));
  const weekEnd = weekStart + 7 * DAY_MS;

  // Mois : une barre par semaine du mois en cours (semaines qui chevauchent le mois).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const monthWeeks: { start: number; end: number; label: string; min: number }[] = [];
  for (let ws = startOfWeek(new Date(monthStart)); ws.getTime() < monthEnd; ws.setDate(ws.getDate() + 7)) {
    monthWeeks.push({
      start: ws.getTime(),
      end: ws.getTime() + 7 * DAY_MS,
      label: `${ws.getDate()}/${ws.getMonth() + 1}`,
      min: 0,
    });
  }

  // Année : 12 mois de l'année civile en cours.
  const months = MONTH_LABELS.map((label) => ({ label, min: 0 }));

  let totalMinYear = 0;
  let weekMin = 0;
  let monthMin = 0;
  let yearCount = 0;
  const strokeMap = new Map<string, number>();

  for (const r of rows) {
    const dur = r.duration_min ?? 0;
    const d = new Date(r.created_at);
    const t = d.getTime();

    if (d.getFullYear() === now.getFullYear()) {
      totalMinYear += dur;
      yearCount += 1;
      months[d.getMonth()].min += dur;
      const strokes = r.strokes && r.strokes.length ? r.strokes : ['Autre'];
      const per = dur / strokes.length; // réparti équitablement -> la somme = total
      for (const s of strokes) strokeMap.set(s, (strokeMap.get(s) ?? 0) + per);
    }

    if (t >= weekStart) weekMin += dur;
    if (t >= weekStart && t < weekEnd) {
      week[Math.min(6, Math.floor((t - weekStart) / DAY_MS))].min += dur;
    }

    if (t >= monthStart && t < monthEnd) {
      monthMin += dur;
      for (const mw of monthWeeks) {
        if (t >= mw.start && t < mw.end) {
          mw.min += dur;
          break;
        }
      }
    }

    for (let i = weekly.length - 1; i >= 0; i--) {
      if (t >= weekly[i].start) {
        weekly[i].min += dur;
        break;
      }
    }
  }

  const byStroke = [...strokeMap.entries()]
    .map(([stroke, min]) => ({ stroke, min: Math.round(min) }))
    .sort((a, b) => b.min - a.min);

  return {
    totalMinYear,
    weekMin,
    monthMin,
    count: yearCount,
    byStroke,
    weekly: weekly.map((w) => ({ label: w.label, min: w.min })),
    activity: {
      week: week.map((w) => ({ label: w.label, min: w.min })),
      month: monthWeeks.map((w) => ({ label: w.label, min: w.min })),
      year: months,
    },
  };
}

// ── helpers d'affichage ──
/** 90 -> "1h30", 60 -> "1h", 45 -> "45 min" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** total lisible sans arrondir l'heure : 90 -> "1h30", 7620 -> "127h", 45 -> "45 min" */
export function formatHours(min: number): string {
  return formatDuration(min);
}
