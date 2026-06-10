import { supabase } from '@/lib/supabase/client';

export type TrainingKind = 'match' | 'solo' | 'jonglage' | 'fitness';

export type TrainingSession = {
  id: string;
  kind: string;
  duration_min: number;
  feeling: string | null;
  note: string | null;
  created_at: string;
};

export async function addTrainingSession(p: {
  playerId: string;
  kind: TrainingKind;
  durationMin: number;
  feeling?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('training_sessions').insert({
    player_id: p.playerId,
    kind: p.kind,
    duration_min: p.durationMin,
    feeling: p.feeling ?? null,
    note: p.note ?? null,
  });
  if (error) throw error;
}

export async function fetchTrainingSessions(playerId: string, limit = 50): Promise<TrainingSession[]> {
  const { data } = await supabase
    .from('training_sessions')
    .select('id, kind, duration_min, feeling, note, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as TrainingSession[] | null) ?? [];
}
