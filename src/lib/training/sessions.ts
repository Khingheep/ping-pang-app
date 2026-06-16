import { supabase } from '@/lib/supabase/client';

export const STROKES = ['Coup droit', 'Revers', 'Service', 'Contre', 'Smash', 'Touche'];
export const PARTNER_LEVELS = ['Débutant', 'ELO 900-1200', 'Mon niveau', 'Meilleur que moi'];
export const FEELINGS = ['Difficile', 'Moyen', 'Bien', 'Excellent'];

export type TrainingSession = {
  id: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  strokes: string[];
  partner_level: string | null;
  venue: { name: string } | null;
  created_at: string;
};

export type StrokeStat = { stroke: string; min: number };
export type TrainingStats = {
  totalMinYear: number;
  weekMin: number;
  count: number;
  byStroke: StrokeStat[];
  weekly: { label: string; min: number }[];
};

export async function addTrainingSession(p: {
  playerId: string;
  durationMin: number;
  strokes: string[];
  partnerLevel?: string | null;
  venueId?: string | null;
  feeling?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('training_sessions').insert({
    player_id: p.playerId,
    duration_min: p.durationMin,
    strokes: p.strokes,
    partner_level: p.partnerLevel ?? null,
    venue_id: p.venueId ?? null,
    feeling: p.feeling ?? null,
    note: p.note ?? null,
  });
  if (error) throw error;
}

type Row = {
  id: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  strokes: string[] | null;
  partner_level: string | null;
  venues: { name: string } | null;
  created_at: string;
};

export async function fetchTrainingSessions(playerId: string, limit = 100): Promise<TrainingSession[]> {
  const { data } = await supabase
    .from('training_sessions')
    .select('id, duration_min, feeling, note, strokes, partner_level, venues(name), created_at')
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
    venue: r.venues ?? null,
    created_at: r.created_at,
  }));
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export async function fetchTrainingStats(playerId: string): Promise<TrainingStats> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const { data } = await supabase
    .from('training_sessions')
    .select('duration_min, strokes, created_at')
    .eq('player_id', playerId)
    .gte('created_at', yearStart);
  const rows = (data as { duration_min: number; strokes: string[] | null; created_at: string }[] | null) ?? [];

  const weekStart = startOfWeek(now).getTime();
  const WEEKS = 8;
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const ws = startOfWeek(now);
    ws.setDate(ws.getDate() - (WEEKS - 1 - i) * 7);
    return { start: ws.getTime(), label: `${ws.getDate()}/${ws.getMonth() + 1}`, min: 0 };
  });

  let totalMinYear = 0;
  let weekMin = 0;
  const strokeMap = new Map<string, number>();

  for (const r of rows) {
    const dur = r.duration_min ?? 0;
    totalMinYear += dur;
    const t = new Date(r.created_at).getTime();
    if (t >= weekStart) weekMin += dur;
    const strokes = r.strokes && r.strokes.length ? r.strokes : ['Autre'];
    const per = dur / strokes.length; // réparti équitablement -> la somme = total
    for (const s of strokes) strokeMap.set(s, (strokeMap.get(s) ?? 0) + per);
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
    count: rows.length,
    byStroke,
    weekly: weekly.map((w) => ({ label: w.label, min: w.min })),
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

/** total en heures arrondies : 7620 min -> "127h" */
export function formatHours(min: number): string {
  return `${Math.round(min / 60)}h`;
}
