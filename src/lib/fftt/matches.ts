import { supabase } from '@/lib/supabase/client';

/** Un match officiel FFTT, normalisé pour l'affichage (table `fftt_matches`). */
export type FfttMatchView = {
  id: string; // match_uid (clé naturelle stable)
  date: string | null; // ISO (match_date) ; null si date FFTT illisible
  dateRaw: string; // format FFTT brut conservé ("JJ/MM/AA")
  opponent: string;
  opponentRank: string | null; // classement officiel adverse ("N26", "12"…)
  won: boolean | null; // true = V, false = D, null = indéterminé
  gainPerte: number | null; // points FFTT gagnés/perdus sur ce match
};

type Row = {
  match_uid: string;
  match_date: string | null;
  match_date_raw: string;
  victoire: boolean | null;
  adversaire_nom: string;
  adversaire_classement: string | null;
  gain_perte: number | null;
};

/**
 * Matchs officiels FFTT d'un licencié, du plus récent au plus ancien.
 * Alimentés par l'edge function `fftt` (action=player) ; lecture publique (RLS select true).
 */
export async function fetchFfttMatches(ffttId: string, limit = 100): Promise<FfttMatchView[]> {
  const { data } = await supabase
    .from('fftt_matches')
    .select('match_uid, match_date, match_date_raw, victoire, adversaire_nom, adversaire_classement, gain_perte')
    .eq('player_number_id', ffttId)
    .order('match_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.match_uid,
    date: r.match_date,
    dateRaw: r.match_date_raw,
    opponent: r.adversaire_nom,
    opponentRank: r.adversaire_classement,
    won: r.victoire,
    gainPerte: r.gain_perte,
  }));
}
