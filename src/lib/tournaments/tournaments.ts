/**
 * Tournois (Événements) — logique client : création, rejoindre par code, génération
 * des poules (round-robin) puis du bracket (2 premiers de chaque poule), saisie des
 * scores avec avancement automatique. Le classement de poule (V/D) est calculé à la volée.
 *
 * Pas de fonction SQL : on orchestre via plusieurs requêtes Supabase (RLS = participants).
 */

import { supabase } from '@/lib/supabase/client';
import { assignPoules, pairWinners, seedBracketRound0 } from './bracket';

export { computePouleStandings } from './bracket';

export type TournamentFormat = 'bo3' | 'bo5' | 'bo7' | 'wtt' | 'champions';
export type TournamentStatus = 'open' | 'poules' | 'bracket' | 'done';
export type TournamentPhase = 'poule' | 'bracket';

export type Tournament = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  format: TournamentFormat;
  max_players: number;
  players_per_poule: number;
  is_ranked: boolean;
  status: TournamentStatus;
  created_at: string;
};

export type TournamentPlayer = {
  player_id: string;
  poule: string | null;
  seed: number | null;
  name: string;
  elo: number;
};

export type TournamentMatch = {
  id: string;
  tournament_id: string;
  phase: TournamentPhase;
  poule: string | null;
  round: number | null;
  slot: number | null;
  player_a: string | null;
  player_b: string | null;
  winner: string | null;
  score: string | null;
  set_scores: string | null;
};

export type TournamentDetail = {
  tournament: Tournament;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
};

export type PouleStanding = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
};

/** Meta format → nombre de sets (best_of) + libellé court. */
export const TOURNAMENT_FORMATS: Record<TournamentFormat, { label: string; bestOf: number }> = {
  bo3: { label: 'BO3', bestOf: 3 },
  bo5: { label: 'BO5', bestOf: 5 },
  bo7: { label: 'BO7', bestOf: 7 },
  wtt: { label: 'WTT', bestOf: 7 },
  champions: { label: 'Champions League', bestOf: 5 },
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O/0/I/1 ambigus

function genCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

// ───────────────────────── Lecture ─────────────────────────

type DetailPlayerRow = {
  player_id: string;
  poule: string | null;
  seed: number | null;
  players: { display_name: string; elo: number } | null;
};

export async function fetchTournamentDetail(id: string): Promise<TournamentDetail | null> {
  const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (!t) return null;

  const { data: pData } = await supabase
    .from('tournament_players')
    .select('player_id, poule, seed, players(display_name, elo)')
    .eq('tournament_id', id);
  const players: TournamentPlayer[] = ((pData as unknown as DetailPlayerRow[] | null) ?? []).map((r) => ({
    player_id: r.player_id,
    poule: r.poule,
    seed: r.seed,
    name: r.players?.display_name ?? 'Joueur',
    elo: r.players?.elo ?? 0,
  }));

  const { data: mData } = await supabase
    .from('tournament_matches')
    .select('id, tournament_id, phase, poule, round, slot, player_a, player_b, winner, score, set_scores')
    .eq('tournament_id', id);

  return {
    tournament: t as Tournament,
    players: players.sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999)),
    matches: (mData as TournamentMatch[] | null) ?? [],
  };
}

/** Tournois où je suis inscrit (créés ou rejoints), plus récents d'abord. */
export async function fetchMyTournaments(playerId: string): Promise<Tournament[]> {
  const { data } = await supabase
    .from('tournament_players')
    .select('tournaments(*)')
    .eq('player_id', playerId);
  const rows = (data as unknown as { tournaments: Tournament | null }[] | null) ?? [];
  return rows
    .map((r) => r.tournaments)
    .filter((t): t is Tournament => !!t)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ───────────────────────── Création / inscription ─────────────────────────

export async function createTournament(
  ownerId: string,
  p: {
    name: string;
    format: TournamentFormat;
    maxPlayers: number;
    playersPerPoule: number;
    isRanked: boolean;
  },
): Promise<Tournament> {
  // Réessaie sur collision de code (improbable mais possible).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        code,
        name: p.name,
        owner_id: ownerId,
        format: p.format,
        max_players: p.maxPlayers,
        players_per_poule: p.playersPerPoule,
        is_ranked: p.isRanked,
        status: 'open',
      })
      .select('*')
      .single();
    if (!error && data) {
      await supabase.from('tournament_players').insert({ tournament_id: data.id, player_id: ownerId });
      return data as Tournament;
    }
    if (error && !error.message.toLowerCase().includes('duplicate')) throw error;
  }
  throw new Error('Impossible de générer un code de tournoi, réessaie.');
}

/** Rejoint un tournoi ouvert via son code. Renvoie l'id du tournoi. */
export async function joinTournamentByCode(playerId: string, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  const { data: t } = await supabase.from('tournaments').select('*').eq('code', code).maybeSingle();
  if (!t) throw new Error('Aucun tournoi avec ce code.');
  const tournament = t as Tournament;
  if (tournament.status !== 'open') throw new Error('Ce tournoi a déjà commencé.');

  const { count } = await supabase
    .from('tournament_players')
    .select('player_id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id);
  if ((count ?? 0) >= tournament.max_players) throw new Error('Ce tournoi est complet.');

  const { error } = await supabase
    .from('tournament_players')
    .insert({ tournament_id: tournament.id, player_id: playerId });
  // 23505 = déjà inscrit → on ignore (idempotent).
  if (error && !error.message.toLowerCase().includes('duplicate')) throw error;
  return tournament.id;
}

// ───────────────────────── Génération des poules ─────────────────────────

/** Lance le tournoi : assigne les poules + crée tous les matchs round-robin. */
export async function startTournament(detail: TournamentDetail): Promise<void> {
  const { tournament, players } = detail;
  if (players.length < 2) throw new Error('Il faut au moins 2 joueurs.');

  const assignments = assignPoules(players, tournament.players_per_poule);

  // 1. Met à jour poule + seed de chaque joueur.
  for (const a of assignments) {
    await supabase
      .from('tournament_players')
      .update({ poule: a.poule, seed: a.seed })
      .eq('tournament_id', tournament.id)
      .eq('player_id', a.player_id);
  }

  // 2. Round-robin : toutes les paires de chaque poule.
  const byPoule = new Map<string, string[]>();
  for (const a of assignments) {
    if (!byPoule.has(a.poule)) byPoule.set(a.poule, []);
    byPoule.get(a.poule)!.push(a.player_id);
  }
  const rows: Record<string, unknown>[] = [];
  for (const [poule, ids] of byPoule) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        rows.push({ tournament_id: tournament.id, phase: 'poule', poule, player_a: ids[i], player_b: ids[j] });
      }
    }
  }
  if (rows.length) await supabase.from('tournament_matches').insert(rows);
  await supabase.from('tournaments').update({ status: 'poules' }).eq('id', tournament.id);
}

// ───────────────────────── Bracket ─────────────────────────

/** Crée le 1er tour du bracket à partir des 2 premiers de chaque poule (croisé 1ers/2es). */
async function generateBracketRound0(detail: TournamentDetail): Promise<void> {
  const rows: Record<string, unknown>[] = seedBracketRound0(detail.players, detail.matches).map((p, i) => ({
    tournament_id: detail.tournament.id,
    phase: 'bracket',
    round: 0,
    slot: i,
    player_a: p.playerA,
    player_b: p.playerB,
  }));
  if (rows.length) {
    const { error } = await supabase.from('tournament_matches').insert(rows);
    if (error) {
      if (error.code === '23505') return; // déjà généré par un autre participant (course) → no-op
      throw error;
    }
  }
  await supabase.from('tournaments').update({ status: 'bracket' }).eq('id', detail.tournament.id);
}

/** Génère le tour suivant du bracket en appariant les vainqueurs du tour courant. */
async function generateNextBracketRound(
  tournamentId: string,
  current: TournamentMatch[],
  nextRound: number,
): Promise<void> {
  const ordered = [...current].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const winners = ordered.map((m) => m.winner).filter((w): w is string => !!w);
  const rows: Record<string, unknown>[] = pairWinners(winners).map((p, i) => ({
    tournament_id: tournamentId,
    phase: 'bracket',
    round: nextRound,
    slot: i,
    player_a: p.playerA,
    player_b: p.playerB,
  }));
  if (rows.length) {
    const { error } = await supabase.from('tournament_matches').insert(rows);
    if (error && error.code !== '23505') throw error; // 23505 = tour déjà généré (course) → ignore
  }
}

// ───────────────────────── Saisie d'un score ─────────────────────────

/**
 * Enregistre le vainqueur d'un match et fait avancer le tournoi :
 *  - poules finies → génère le bracket
 *  - tour de bracket fini → génère le tour suivant (ou clôture le tournoi)
 */
export async function recordTournamentMatch(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  score: string | null,
  setScores: string | null = null,
): Promise<void> {
  await supabase
    .from('tournament_matches')
    .update({ winner: winnerId, score, set_scores: setScores })
    .eq('id', matchId);

  const detail = await fetchTournamentDetail(tournamentId);
  if (!detail) return;
  const { tournament, matches } = detail;

  const pouleMatches = matches.filter((m) => m.phase === 'poule');
  const bracketMatches = matches.filter((m) => m.phase === 'bracket');

  if (tournament.status === 'poules') {
    if (pouleMatches.length > 0 && pouleMatches.every((m) => m.winner) && bracketMatches.length === 0) {
      await generateBracketRound0(detail);
    }
    return;
  }

  if (tournament.status === 'bracket' && bracketMatches.length) {
    const maxRound = Math.max(...bracketMatches.map((m) => m.round ?? 0));
    const cur = bracketMatches.filter((m) => (m.round ?? 0) === maxRound);
    if (cur.every((m) => m.winner)) {
      if (cur.length === 1) {
        await supabase.from('tournaments').update({ status: 'done' }).eq('id', tournamentId);
      } else {
        await generateNextBracketRound(tournamentId, cur, maxRound + 1);
      }
    }
  }
}
