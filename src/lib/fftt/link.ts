import { supabase } from '@/lib/supabase/client';

export type FfttDetail = {
  numberId: string;
  nom?: string;
  prenom?: string;
  classementMensuel: string | null;
  pointsMensuels: number | null;
  pointsOfficiels: number | null;
};

async function invokeFftt(body: Record<string, unknown>): Promise<{ player?: FfttDetail; error?: string }> {
  const { data, error } = await supabase.functions.invoke('fftt', { body });
  if (error) {
    let msg = 'Service FFTT indisponible';
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const j = ctx?.json ? await ctx.json() : null;
      if (j?.error === 'session_expired') msg = 'Session FFTT à rafraîchir (CAPTCHA). Réessaie plus tard.';
      else if (j?.error) msg = j.error;
    } catch {
      // garde le message générique
    }
    throw new Error(msg);
  }
  const d = data as { player?: FfttDetail; error?: string };
  if (d?.error) throw new Error(d.error);
  return d;
}

/** Récupère un joueur FFTT par numéro de licence (via l'edge function). */
export async function fetchFfttByLicence(licence: string): Promise<FfttDetail | null> {
  const d = await invokeFftt({ action: 'player', numberId: licence });
  return d.player ?? null;
}

/** Lie le compte FFTT au profil : enregistre fftt_id + fftt_points. */
export async function linkFfttToProfile(userId: string, detail: FfttDetail): Promise<number | null> {
  const points = detail.pointsOfficiels ?? detail.pointsMensuels ?? null;
  const { error } = await supabase
    .from('players')
    .update({ fftt_id: detail.numberId, fftt_points: points })
    .eq('id', userId);
  if (error) throw error;
  return points;
}
