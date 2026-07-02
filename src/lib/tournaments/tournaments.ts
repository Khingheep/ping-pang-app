/**
 * Tournois (Événements) - logique client : création, rejoindre par code, génération
 * des poules (round-robin) puis du bracket (2 premiers de chaque poule), saisie des
 * scores avec avancement automatique. Le classement de poule (V/D) est calculé à la volée.
 *
 * Pas de fonction SQL : on orchestre via plusieurs requêtes Supabase (RLS = participants).
 */

import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { assignPoules, numPoulesForPlayers, pairWinners, pouleMatchOrder, seedBracketRound0 } from './bracket';

export { computeFinalRanking, computePlayerRecords, computePouleStandings, type FinalRankEntry, type PlayerRecord } from './bracket';

export type TournamentFormat = 'bo3' | 'bo5' | 'bo7';
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
  qualifiers_per_poule: number; // nb de joueurs qualifiés par poule pour le tableau (1, 2 ou 3)
  is_ranked: boolean;
  status: TournamentStatus;
  created_at: string;
};

export type TournamentPlayer = {
  player_id: string;
  poule: string | null;
  seed: number | null;
  name: string;
  avatar: string | null;
  elo: number;
  ranking: number | null; // classement officiel FFTT (fftt_points) - base du seeding ; null = non licencié
  club: string | null; // club FFTT - sert à éviter 2 joueurs du même club dans une poule
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
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
};

/** Meta format → nombre de sets (best_of) + libellé court. */
export const TOURNAMENT_FORMATS: Record<TournamentFormat, { label: string; bestOf: number }> = {
  bo3: { label: 'BO3', bestOf: 3 },
  bo5: { label: 'BO5', bestOf: 5 },
  bo7: { label: 'BO7', bestOf: 7 },
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
  players: { display_name: string; elo: number; fftt_points: number | null; fftt_club: string | null; avatar_url: string | null } | null;
};

export async function fetchTournamentDetail(id: string): Promise<TournamentDetail | null> {
  const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (!t) return null;

  const { data: pData } = await supabase
    .from('tournament_players')
    .select('player_id, poule, seed, players(display_name, elo, fftt_points, fftt_club, avatar_url)')
    .eq('tournament_id', id);
  const players: TournamentPlayer[] = ((pData as unknown as DetailPlayerRow[] | null) ?? []).map((r) => ({
    player_id: r.player_id,
    poule: r.poule,
    seed: r.seed,
    name: r.players?.display_name ?? 'Joueur',
    avatar: r.players?.avatar_url ?? null,
    elo: r.players?.elo ?? 0,
    ranking: r.players?.fftt_points ?? null,
    club: r.players?.fftt_club ?? null,
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

/** Mes tournois (mis en cache). */
export function useMyTournaments(playerId: string | undefined) {
  return useQuery({
    queryKey: qk.tournaments.mine(playerId ?? 'anon'),
    queryFn: () => fetchMyTournaments(playerId!),
    enabled: !!playerId,
    staleTime: STALE.players,
  });
}

// ───────────────────────── Création / inscription ─────────────────────────

export async function createTournament(
  ownerId: string,
  p: {
    name: string;
    format: TournamentFormat;
    maxPlayers: number;
    playersPerPoule?: number; // optionnel : le nombre de poules est recalculé au lancement selon les inscrits réels
    qualifiersPerPoule?: number; // nb de qualifiés par poule (1, 2 ou 3) - défaut 2
    isRanked: boolean;
  },
): Promise<Tournament> {
  // Valeur stockée à titre indicatif (capacité max) ; l'assignation réelle se fait au lancement.
  const perPoule = p.playersPerPoule ?? Math.ceil(p.maxPlayers / numPoulesForPlayers(p.maxPlayers));
  const qualifiers = Math.min(3, Math.max(1, p.qualifiersPerPoule ?? 2));
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
        players_per_poule: perPoule,
        qualifiers_per_poule: qualifiers,
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

/** L'organisateur inscrit directement des joueurs existants (sans code). RLS : owner only. */
export async function addPlayersToTournament(tournamentId: string, playerIds: string[]): Promise<void> {
  if (!playerIds.length) return;
  const { error } = await supabase
    .from('tournament_players')
    .upsert(
      playerIds.map((player_id) => ({ tournament_id: tournamentId, player_id })),
      { onConflict: 'tournament_id,player_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

// ───────────────────────── Génération des poules ─────────────────────────

/**
 * Avance le statut du tournoi via la fonction SECURITY DEFINER (cf. migration 0044) : ça marche
 * pour tout participant, pas seulement l'organisateur - sinon un joueur saisissant le match
 * décisif bloquerait la transition de phase (l'UPDATE direct de `tournaments` est owner-only).
 */
async function setTournamentStatus(tournamentId: string, status: TournamentStatus): Promise<void> {
  const { error } = await supabase.rpc('set_tournament_status', { t_id: tournamentId, new_status: status });
  if (error) throw error;
}

/** Lance le tournoi : assigne les poules + crée tous les matchs round-robin. */
export async function startTournament(detail: TournamentDetail): Promise<void> {
  const { tournament, players } = detail;
  // Idempotent : un tournoi déjà lancé (ou avec des matchs) ne re-génère JAMAIS - sinon
  // les matchs de poule seraient insérés en double (3 → 6). L'index unique en base (cf. 0049)
  // est le dernier rempart en cas de course entre deux participants.
  if (tournament.status !== 'open') return;
  if (detail.matches.some((m) => m.phase === 'poule')) return;
  if (players.length < 2) throw new Error('Il faut au moins 2 joueurs.');

  // Nombre de poules recalculé selon les inscrits RÉELS (pas la capacité max) → toujours équilibré.
  const assignments = assignPoules(players, numPoulesForPlayers(players.length));

  // 1. Met à jour poule + seed de chaque joueur.
  for (const a of assignments) {
    await supabase
      .from('tournament_players')
      .update({ poule: a.poule, seed: a.seed })
      .eq('tournament_id', tournament.id)
      .eq('player_id', a.player_id);
  }

  // 2. Round-robin dans l'ordre officiel FFTT. Les joueurs d'une poule sont rangés par seed
  //    (rang 1 = tête de série) puis appariés selon le « brûlage » ; `slot` fige l'ordre d'affichage.
  const byPoule = new Map<string, { player_id: string; seed: number }[]>();
  for (const a of assignments) {
    if (!byPoule.has(a.poule)) byPoule.set(a.poule, []);
    byPoule.get(a.poule)!.push({ player_id: a.player_id, seed: a.seed });
  }
  const rows: Record<string, unknown>[] = [];
  for (const [poule, members] of byPoule) {
    const ranked = members.sort((x, y) => x.seed - y.seed).map((m) => m.player_id); // rang 1..n
    pouleMatchOrder(ranked.length).forEach(([i, j], slot) => {
      rows.push({
        tournament_id: tournament.id,
        phase: 'poule',
        poule,
        slot,
        player_a: ranked[i - 1],
        player_b: ranked[j - 1],
      });
    });
  }
  if (rows.length) {
    const { error } = await supabase.from('tournament_matches').insert(rows);
    if (error && error.code !== '23505') throw error; // 23505 = déjà généré (course) → ignore
  }
  await setTournamentStatus(tournament.id, 'poules');
}

// ───────────────────────── Bracket ─────────────────────────

/** Crée le 1er tour du bracket à partir des 2 premiers de chaque poule (croisé 1ers/2es). */
async function generateBracketRound0(detail: TournamentDetail): Promise<void> {
  const qualifiers = detail.tournament.qualifiers_per_poule ?? 2;
  const rows: Record<string, unknown>[] = seedBracketRound0(detail.players, detail.matches, qualifiers).map((p, i) => ({
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
  await setTournamentStatus(detail.tournament.id, 'bracket');
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
  await advanceTournament(tournamentId);
}

/** Score d'un forfait : le présent gagne `need` manches 11-0 (vue de player_a). */
function forfeitScore(presentIsPlayerA: boolean, bestOf: number): { score: string; setScores: string } {
  const need = Math.ceil(bestOf / 2);
  const unit = presentIsPlayerA ? '11-0' : '0-11';
  return {
    score: presentIsPlayerA ? `${need}-0` : `0-${need}`,
    setScores: Array.from({ length: need }, () => unit).join(','),
  };
}

/** Déclare un forfait sur UN match : le joueur présent l'emporte 3-0 (11-0 par manche), façon FFTT. */
export async function recordTournamentForfeit(
  tournamentId: string,
  match: TournamentMatch,
  presentPlayerId: string,
  bestOf: number,
): Promise<void> {
  const { score, setScores } = forfeitScore(match.player_a === presentPlayerId, bestOf);
  await recordTournamentMatch(tournamentId, match.id, presentPlayerId, score, setScores);
}

/**
 * Déclare un joueur forfait/absent pour TOUTE sa poule : chacun de ses matchs encore à jouer est
 * perdu par forfait (l'adversaire gagne 3-0). On met à jour en lot puis on fait avancer une seule fois.
 */
export async function forfeitPlayerInPoule(
  detail: TournamentDetail,
  playerId: string,
  bestOf: number,
): Promise<void> {
  const pending = detail.matches.filter(
    (m) => m.phase === 'poule' && !m.winner && m.player_a && m.player_b && (m.player_a === playerId || m.player_b === playerId),
  );
  for (const m of pending) {
    const opponentId = m.player_a === playerId ? m.player_b! : m.player_a!;
    const { score, setScores } = forfeitScore(m.player_a === opponentId, bestOf);
    await supabase
      .from('tournament_matches')
      .update({ winner: opponentId, score, set_scores: setScores })
      .eq('id', m.id);
  }
  await advanceTournament(detail.tournament.id);
}

/**
 * Fait avancer le tournoi après un (ou plusieurs) résultat(s) :
 *  - poules finies → génère le bracket
 *  - tour de bracket fini → génère le tour suivant (ou clôture le tournoi)
 */
async function advanceTournament(tournamentId: string): Promise<void> {
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
        await setTournamentStatus(tournamentId, 'done');
      } else {
        await generateNextBracketRound(tournamentId, cur, maxRound + 1);
      }
    }
  }
}
