import { supabase } from '@/lib/supabase/client';

/** Ligne de résultat de recherche FFTT (action=search). */
export type FfttPlayer = {
  numberId: string;
  nom: string;
  prenom: string;
  rangNational: number | null;
  pointsOfficiels: number | null;
  pointsMensuels: number | null;
  classementOfficiel: string | null;
  club: { nom: string } | null;
};

/** Détail d'un joueur FFTT (action=player). */
export type FfttDetail = {
  numberId: string;
  nom?: string;
  prenom?: string;
  classementMensuel: string | null;
  pointsMensuels: number | null;
  pointsOfficiels: number | null;
};

type FfttResponse = { player?: FfttDetail; players?: FfttPlayer[]; error?: string };

async function invokeFftt(body: Record<string, unknown>): Promise<FfttResponse> {
  const { data, error } = await supabase.functions.invoke('fftt', { body });
  if (error) {
    let msg = 'Service FFTT indisponible';
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const j = ctx?.json ? await ctx.json() : null;
      if (j?.error === 'session_expired') msg = 'Session FFTT à rafraîchir, réessaie dans quelques minutes.';
      else if (j?.error) msg = j.error;
    } catch {
      // garde le message générique
    }
    throw new Error(msg);
  }
  const d = data as FfttResponse;
  if (d?.error) throw new Error(d.error);
  return d;
}

/** Recherche FFTT par nom / prénom / licence (le sexe est requis par la FFTT). */
export async function searchFftt(params: {
  nom?: string;
  prenom?: string;
  licence?: string;
  sexe: 'Hommes' | 'Femmes';
}): Promise<FfttPlayer[]> {
  const d = await invokeFftt({ action: 'search', ...params });
  return d.players ?? [];
}

/** Récupère un joueur FFTT par numéro de licence. */
export async function fetchFfttByLicence(licence: string): Promise<FfttDetail | null> {
  const d = await invokeFftt({ action: 'player', numberId: licence });
  return d.player ?? null;
}

/** Lie le compte FFTT au profil : enregistre fftt_id + fftt_points. */
export async function linkFfttToProfile(
  userId: string,
  p: { numberId: string; pointsOfficiels: number | null; pointsMensuels: number | null },
): Promise<number | null> {
  const points = p.pointsOfficiels ?? p.pointsMensuels ?? null;
  const { error } = await supabase
    .from('players')
    .update({ fftt_id: p.numberId, fftt_points: points })
    .eq('id', userId);
  if (error) throw error;
  return points;
}
