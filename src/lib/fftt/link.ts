import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { matchVenueByName } from '@/lib/venues/venues';

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
  pointsTempsReel?: number | null;
  pointsDebutSaison?: number | null;
  pointsMensuelsPrecedents?: number | null;
};

/** Détail d'un joueur FFTT (action=player). */
export type FfttDetail = {
  numberId: string;
  nom?: string;
  prenom?: string;
  classementMensuel: string | null;
  pointsMensuels: number | null;
  pointsOfficiels: number | null;
  pointsTempsReel?: number | null;
  pointsDebutSaison?: number | null;
  pointsMensuelsPrecedents?: number | null;
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
      else if (j?.error === 'rate_limited') msg = 'Trop de requêtes, réessaie dans quelques secondes.';
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

/**
 * Meilleure estimation de la force FFTT pour seeder le rating Glicko :
 * temps réel (intègre les matchs non encore officialisés) > officiel > mensuel.
 */
export function ffttSeedPoints(p: {
  pointsTempsReel?: number | null;
  pointsOfficiels: number | null;
  pointsMensuels: number | null;
}): number | null {
  return p.pointsTempsReel ?? p.pointsOfficiels ?? p.pointsMensuels ?? null;
}

/**
 * Résout les points de force d'un joueur. Les lignes de recherche PAR NOM
 * (HTML PingPocket) ne contiennent pas de points → on va chercher le détail
 * (API JSON par licence) pour récupérer pointsTempsReel/Officiels/Mensuels.
 */
export async function resolveFfttPoints(p: FfttPlayer): Promise<number | null> {
  const fromRow = ffttSeedPoints(p);
  // La colonne `fftt_points` est un entier, mais les points TEMPS RÉEL FFTT sont
  // fractionnaires (ex. 2246.5) → on arrondit avant persistance pour éviter
  // « invalid input syntax for type integer ». L'ELO dérivé est déjà arrondi.
  if (fromRow != null) return Math.round(fromRow);
  const d = await fetchFfttByLicence(p.numberId);
  const pts = d ? ffttSeedPoints(d) : null;
  return pts != null ? Math.round(pts) : null;
}

/** Point d'historique de classement officiel (action=history). */
export type FfttRankingPoint = { date: string; points: number; nationalRanking: number | null };

/** Adversaire commun entre 2 joueurs + résultats de chacun (action=common). */
export type FfttHeadToHead = {
  opponent: { numberId: string; nom: string };
  a: { date: string; victoire: boolean; journee: number | null }[];
  b: { date: string; victoire: boolean; journee: number | null }[];
};

/** Historique de classement officiel d'un joueur (tendance long terme, depuis ~2012). */
export async function fetchFfttHistory(licence: string): Promise<FfttRankingPoint[]> {
  const { data, error } = await supabase.functions.invoke('fftt', {
    body: { action: 'history', numberId: licence },
  });
  if (error) return [];
  return (data as { history?: FfttRankingPoint[] })?.history ?? [];
}

/** Adversaires communs entre deux licenciés (head-to-head). */
export async function fetchFfttCommonOpponents(a: string, b: string): Promise<FfttHeadToHead[]> {
  const { data, error } = await supabase.functions.invoke('fftt', {
    body: { action: 'common', numberId: a, opponentId: b },
  });
  if (error) return [];
  return (data as { common?: FfttHeadToHead[] })?.common ?? [];
}

/** Adversaires communs FFTT entre deux licences (mis en cache). Désactivé si l'une manque ou si identiques. */
export function useFfttCommonOpponents(myFftt: string | null | undefined, theirFftt: string | null | undefined) {
  return useQuery({
    queryKey: qk.fftt.commonOpponents(myFftt ?? 'none', theirFftt ?? 'none'),
    queryFn: () => fetchFfttCommonOpponents(myFftt!, theirFftt!),
    enabled: !!myFftt && !!theirFftt && myFftt !== theirFftt,
    staleTime: STALE.trainingStats,
  });
}

/** Lie le compte FFTT au profil : enregistre fftt_id + fftt_points (force temps réel) + club. */
export async function linkFfttToProfile(userId: string, p: FfttPlayer): Promise<number | null> {
  const points = await resolveFfttPoints(p);
  const { error } = await supabase
    .from('players')
    .update({ fftt_id: p.numberId, fftt_points: points, fftt_club: p.club?.nom ?? null })
    .eq('id', userId);
  if (error) throw error;
  // Best-effort : si le club FFTT correspond à un lieu connu et qu'aucun club maison n'est défini,
  // on le pré-remplit. N'interrompt jamais le lien (colonne/match absents → on ignore).
  try {
    const club = p.club?.nom ?? null;
    if (club) {
      const venue = await matchVenueByName(club);
      if (venue) {
        const { data } = await supabase.from('players').select('home_venue_id').eq('id', userId).maybeSingle();
        const has = (data as { home_venue_id: string | null } | null)?.home_venue_id;
        if (!has) await supabase.from('players').update({ home_venue_id: venue.id }).eq('id', userId);
      }
    }
  } catch {
    /* match club optionnel */
  }
  return points;
}

/**
 * Backfill du club pour un compte déjà lié AVANT l'ajout de `fftt_club` : relit le club
 * depuis le miroir local `fftt_players` (pas d'appel réseau FFTT) et le persiste. No-op si
 * le club est introuvable dans le miroir. Renvoie le club résolu (ou null).
 */
export async function backfillFfttClub(userId: string, ffttId: string): Promise<string | null> {
  const { data } = await supabase
    .from('fftt_players')
    .select('club_nom')
    .eq('number_id', ffttId)
    .maybeSingle();
  const club = (data as { club_nom: string | null } | null)?.club_nom ?? null;
  if (club) {
    await supabase.from('players').update({ fftt_club: club }).eq('id', userId);
  }
  return club;
}

/** Délie le compte FFTT : efface fftt_id + fftt_points + club (l'ELO/Glicko déjà acquis est conservé). */
export async function unlinkFfttFromProfile(userId: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ fftt_id: null, fftt_points: null, fftt_club: null })
    .eq('id', userId);
  if (error) throw error;
}
