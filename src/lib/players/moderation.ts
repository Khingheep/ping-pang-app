import { useQuery } from '@tanstack/react-query';

import { STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

/**
 * Modération (retours Paul 07/07/2026, migration 0060) :
 * signalements de comptes pour fraude + actions admin (traiter, RAZ refus,
 * supprimer un compte). Les gardes réelles sont côté Postgres (is_admin(),
 * fonctions SECURITY DEFINER) — le client ne fait qu'afficher.
 */

export async function fetchIsAdmin(myId: string): Promise<boolean> {
  const { data } = await supabase.from('players').select('is_admin').eq('id', myId).maybeSingle();
  return (data as { is_admin: boolean | null } | null)?.is_admin ?? false;
}

/** Le user courant est-il admin ? (gate l'entrée Réglages + l'écran /admin) */
export function useIsAdmin(myId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'me', myId ?? 'anon'],
    queryFn: () => fetchIsAdmin(myId!),
    enabled: !!myId,
    staleTime: STALE.profile,
  });
}

/** Signale un compte pour fraude. Un seul signalement ouvert par joueur visé. */
export async function reportPlayer(p: {
  reporterId: string;
  reportedId: string;
  reason: string;
  matchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('player_reports').insert({
    reporter: p.reporterId,
    reported: p.reportedId,
    reason: p.reason,
    match_id: p.matchId ?? null,
  });
  if (error) {
    // 23505 = index unique (reporter, reported) où status='open'
    if (error.code === '23505') throw new Error('Tu as déjà un signalement en cours sur ce joueur.');
    throw new Error(error.message);
  }
}

export type AdminReportPlayer = {
  id: string;
  display_name: string;
  handle: string;
  dispute_count?: number;
  elo?: number;
};

export type AdminReport = {
  id: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  reporter: AdminReportPlayer | null;
  reported: AdminReportPlayer | null;
};

/** Tableau des signalements (RLS : seuls les admins voient tout). */
export async function fetchReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase
    .from('player_reports')
    .select(
      `id, reason, status, created_at,
       reporter:players!player_reports_reporter_fkey(id, display_name, handle),
       reported:players!player_reports_reported_fkey(id, display_name, handle, dispute_count, elo)`,
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data as unknown as AdminReport[] | null) ?? [];
}

export function useAdminReports(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: fetchReports,
    enabled,
    staleTime: 15_000,
  });
}

/** Clôt un signalement : 'resolved' (traité) ou 'dismissed' (ignoré). */
export async function resolveReport(reportId: string, action: 'resolved' | 'dismissed'): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_report', { p_report: reportId, p_action: action });
  if (error) throw new Error(error.message);
}

/** Remet à zéro le compteur de contestations d'un joueur (grâce admin). */
export async function resetDisputes(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_disputes', { p_target: targetId });
  if (error) throw new Error(error.message);
}

/** Supprime un compte (ligne players + login auth). Cas extrême. */
export async function adminDeletePlayer(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_player', { p_target: targetId });
  if (error) throw new Error(error.message);
}
