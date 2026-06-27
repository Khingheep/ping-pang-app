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

/** Recherche FFTT par nom / prénom / licence. Sexe omis → l'edge cherche Hommes + Femmes. */
export async function searchFftt(params: {
  nom?: string;
  prenom?: string;
  licence?: string;
  sexe?: 'Hommes' | 'Femmes';
}): Promise<FfttPlayer[]> {
  const d = await invokeFftt({ action: 'search', ...params });
  return d.players ?? [];
}

type MirrorRow = {
  number_id: string;
  nom: string;
  prenom: string;
  club_nom: string | null;
  classement: string | null;
  points_off: number | null;
  points_men: number | null;
  rang_national: number | null;
};

function fromMirror(r: MirrorRow): FfttPlayer {
  return {
    numberId: r.number_id,
    nom: r.nom,
    prenom: r.prenom,
    rangNational: r.rang_national,
    pointsOfficiels: r.points_off,
    pointsMensuels: r.points_men,
    classementOfficiel: r.classement,
    club: r.club_nom ? { nom: r.club_nom } : null,
  };
}

/** Recherche TYPEAHEAD instantanée dans le miroir local `fftt_players`. */
export async function searchFfttLocal(params: {
  nom?: string;
  prenom?: string;
  sexe?: 'Hommes' | 'Femmes';
}): Promise<FfttPlayer[]> {
  const clean = (s?: string) => (s ?? '').trim().replace(/[^a-zA-ZÀ-ÿ' -]/g, '');
  const nom = clean(params.nom);
  const prenom = clean(params.prenom);
  if (nom.length < 2 && prenom.length < 2) return [];

  let req = supabase
    .from('fftt_players')
    .select('number_id, nom, prenom, club_nom, classement, points_off, points_men, rang_national')
    .limit(25);
  if (nom) req = req.ilike('nom', `${nom}%`);
  if (prenom) req = req.ilike('prenom', `${prenom}%`);
  if (params.sexe) req = req.eq('sexe', params.sexe === 'Hommes' ? 'H' : 'F');

  const { data } = await req.order('points_off', { ascending: false, nullsFirst: false });
  return ((data as MirrorRow[] | null) ?? []).map(fromMirror);
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
