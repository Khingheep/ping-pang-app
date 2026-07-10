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
import { assignPoules, numPoulesForPlayers, pairWinners, pouleMatchOrder, seedBracketRound0, seedDirectBracket } from './bracket';

export { computeFinalRanking, computePlayerRecords, computePouleStandings, type FinalRankEntry, type PlayerRecord } from './bracket';

export type TournamentFormat = 'bo1' | 'bo3' | 'bo5' | 'bo7';
export type TournamentStatus = 'open' | 'poules' | 'bracket' | 'done';
export type TournamentPhase = 'poule' | 'bracket';
/** Formule du tournoi : poules + tableau (défaut) ou tableau à élimination directe (sans poules). */
export type TournamentStructure = 'poules' | 'bracket';

export type Tournament = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  format: TournamentFormat; // format des poules (et format unique en tableau direct)
  bracket_format: TournamentFormat | null; // format du tableau final ; null = reprend `format`
  max_players: number;
  players_per_poule: number;
  qualifiers_per_poule: number; // nb de joueurs qualifiés par poule pour le tableau (1, 2 ou 3)
  structure: TournamentStructure; // 'poules' (défaut) | 'bracket' (élimination directe, sans poules)
  is_ranked: boolean;
  status: TournamentStatus;
  city: string | null; // localisation libre (optionnelle) — pour filtrer « Mes tournois »
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
  isGuest: boolean; // invité ajouté par l'organisateur (sans compte)
  organizer: boolean; // co-organisateur : peut saisir le score de n'importe quel match
  plays: boolean; // false = organisateur « au desk » qui gère sans être tiré dans les poules
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
  bo1: { label: 'BO1', bestOf: 1 },
  bo3: { label: 'BO3', bestOf: 3 },
  bo5: { label: 'BO5', bestOf: 5 },
  bo7: { label: 'BO7', bestOf: 7 },
};

/**
 * Best-of applicable à un match selon sa PHASE : les matchs de tableau utilisent `bracket_format`
 * s'il est défini (ex. poules en BO3, tableau final en BO5), sinon on retombe sur `format`.
 */
export function bestOfForMatch(t: Pick<Tournament, 'format' | 'bracket_format'>, phase: TournamentPhase): number {
  const fmt = phase === 'bracket' ? t.bracket_format ?? t.format : t.format;
  return TOURNAMENT_FORMATS[fmt]?.bestOf ?? 5;
}

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
  is_organizer: boolean | null;
  plays: boolean | null;
  players: { display_name: string; elo: number; fftt_points: number | null; fftt_club: string | null; avatar_url: string | null; is_guest: boolean | null } | null;
};

export async function fetchTournamentDetail(id: string): Promise<TournamentDetail | null> {
  const { data: t } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  if (!t) return null;

  const { data: pData } = await supabase
    .from('tournament_players')
    .select('player_id, poule, seed, is_organizer, plays, players(display_name, elo, fftt_points, fftt_club, avatar_url, is_guest)')
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
    isGuest: r.players?.is_guest ?? false,
    organizer: r.is_organizer ?? false,
    plays: r.plays ?? true,
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
    format: TournamentFormat; // format des poules (ou format unique en tableau direct)
    bracketFormat?: TournamentFormat; // format du tableau final ; défaut = `format`
    maxPlayers: number;
    playersPerPoule?: number; // optionnel : le nombre de poules est recalculé au lancement selon les inscrits réels
    qualifiersPerPoule?: number; // nb de qualifiés par poule (1, 2 ou 3) - défaut 2
    structure?: TournamentStructure; // 'poules' (défaut) | 'bracket' (tableau direct)
    isRanked: boolean;
    city?: string; // localisation libre (optionnelle)
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
        // On ne stocke le format tableau que s'il diffère (sinon null → reprend `format`).
        bracket_format: p.bracketFormat && p.bracketFormat !== p.format ? p.bracketFormat : null,
        max_players: p.maxPlayers,
        players_per_poule: perPoule,
        qualifiers_per_poule: qualifiers,
        structure: p.structure ?? 'poules',
        is_ranked: p.isRanked,
        status: 'open',
        city: p.city?.trim() || null,
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

/**
 * L'organisateur inscrit un « invité » (sans compte) : crée une ligne joueur dédiée et l'ajoute
 * au tournoi, en une opération atomique (RPC SECURITY DEFINER, cf. migration 0056). ELO optionnel
 * (défaut 1200). Renvoie l'id du joueur invité créé.
 */
export async function addGuestToTournament(tournamentId: string, name: string, elo?: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_tournament_guest', {
    t_id: tournamentId,
    guest_name: name.trim(),
    guest_elo: elo ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * L'organisateur modifie un INVITÉ déjà inscrit : son nom (cosmétique) et/ou son ELO (sert au
 * seeding). RPC SECURITY DEFINER (cf. migration 0066) gated manager + invité de ce tournoi
 * uniquement. `elo` omis → l'ELO n'est pas touché.
 */
export async function updateTournamentGuest(
  tournamentId: string,
  playerId: string,
  name: string,
  elo?: number,
): Promise<void> {
  const { error } = await supabase.rpc('update_tournament_guest', {
    t_id: tournamentId,
    target: playerId,
    guest_name: name.trim(),
    guest_elo: elo ?? null,
  });
  if (error) throw error;
}

/**
 * L'organisateur ajuste la capacité (nombre de joueurs max) d'un tournoi PAS encore lancé.
 * Écriture directe : la RLS `tournaments update owner` (0021) réserve déjà ça au propriétaire.
 * Le nombre de poules est recalculé au lancement selon les inscrits réels → sans impact ici.
 */
export async function updateTournamentMaxPlayers(tournamentId: string, maxPlayers: number): Promise<void> {
  const { error } = await supabase
    .from('tournaments')
    .update({ max_players: maxPlayers })
    .eq('id', tournamentId)
    .eq('status', 'open');
  if (error) throw error;
}

/**
 * L'organisateur modifie le(s) format(s) : poules et/ou tableau final (ex. poules BO3 / tableau BO5).
 * RPC SECURITY DEFINER (cf. migration 0066) gated manager, autorisée tant que le tournoi n'est pas
 * terminé. Ne re-valide PAS les scores déjà saisis : n'affecte que la saisie des matchs à venir.
 */
export async function setTournamentFormats(
  tournamentId: string,
  pouleFormat: TournamentFormat,
  bracketFormat: TournamentFormat,
): Promise<void> {
  const { error } = await supabase.rpc('set_tournament_formats', {
    t_id: tournamentId,
    poule_fmt: pouleFormat,
    // On ne stocke le format tableau que s'il diffère (sinon null → reprend le format des poules).
    bracket_fmt: bracketFormat !== pouleFormat ? bracketFormat : null,
  });
  if (error) throw error;
}

/**
 * L'organisateur retire un inscrit avant le lancement (phase « open »). Passe par une RPC
 * SECURITY DEFINER (cf. migration 0064) qui fait aussi le ménage de la ligne joueur d'un invité
 * (sinon orpheline). Réservé au propriétaire ; l'organisateur lui-même ne peut pas être retiré.
 */
export async function removePlayerFromTournament(tournamentId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_tournament_player', { t_id: tournamentId, target: playerId });
  if (error) throw error;
}

/**
 * L'organisateur promeut / rétrograde un participant comme co-organisateur : il peut alors saisir
 * le score de n'importe quel match (utile pour gérer un event à plusieurs téléphones).
 * Réservé au propriétaire du tournoi (RPC SECURITY DEFINER, cf. migration 0057).
 */
export async function setTournamentOrganizer(tournamentId: string, playerId: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_tournament_organizer', { t_id: tournamentId, target: playerId, value });
  if (error) throw error;
}

/**
 * L'organisateur bascule un participant « joue » ↔ « au desk » (ne joue pas). Un participant au
 * desk gère (s'il est co-orga) mais n'est pas tiré dans les poules. Réservé au propriétaire.
 */
export async function setTournamentPlays(tournamentId: string, playerId: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_tournament_plays', { t_id: tournamentId, target: playerId, value });
  if (error) throw error;
}

/**
 * Remet un tournoi lancé en phase « inscriptions » (status = 'open') : supprime tous ses matchs et
 * réinitialise poule/seed. RPC SECURITY DEFINER (cf. migration 0066) gated manager, REFUSÉE dès
 * qu'un vrai score a été saisi (les byes auto du tableau direct ne comptent pas). Sert à ajouter/
 * retirer un joueur oublié, puis relancer le tirage.
 */
export async function resetTournamentToOpen(tournamentId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_tournament_to_open', { t_id: tournamentId });
  if (error) throw error;
}

/**
 * Refait le tirage (poules ou tableau) avec les inscrits actuels : reset → open, puis relance.
 * Réutilise tout le moteur de génération. À n'appeler que tant qu'aucun score n'est saisi.
 */
export async function redrawTournament(tournamentId: string): Promise<void> {
  await resetTournamentToOpen(tournamentId);
  const fresh = await fetchTournamentDetail(tournamentId);
  if (fresh) await startTournament(fresh);
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

/** Lance le tournoi : poules + matchs round-robin, OU tableau direct selon la formule choisie. */
export async function startTournament(detail: TournamentDetail): Promise<void> {
  const { tournament, players } = detail;
  // Idempotent : un tournoi déjà lancé ne re-génère JAMAIS (le statut n'est plus 'open').
  if (tournament.status !== 'open') return;
  // Les organisateurs « au desk » (plays = false) gèrent sans être tirés dans le tirage.
  const playing = players.filter((p) => p.plays);
  if (playing.length < 2) throw new Error('Il faut au moins 2 joueurs.');

  // Formule « tableau direct » : pas de poules, on seed tout le monde par ELO dans le tableau.
  if (tournament.structure === 'bracket') {
    await startDirectBracket(detail, playing);
    return;
  }

  // ── Formule « poules + tableau » (historique) ──
  // Un tournoi avec des matchs de poule ne re-génère jamais (sinon doublons 3 → 6). L'index
  // unique en base (cf. 0049) est le dernier rempart en cas de course entre deux participants.
  if (detail.matches.some((m) => m.phase === 'poule')) return;

  // Nombre de poules recalculé selon les inscrits RÉELS (pas la capacité max) → toujours équilibré.
  const assignments = assignPoules(playing, numPoulesForPlayers(playing.length));

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

/** Vainqueur d'office d'un match « exempt » (un seul joueur présent), sinon null. */
function byeWinner(a: string | null, b: string | null): string | null {
  if (a && !b) return a;
  if (b && !a) return b;
  return null;
}

/**
 * Lance un tournoi en « tableau direct » (sans poules) : seed tous les joueurs par ELO
 * (le meilleur = tête de série 1, formule serpent), crée le 1er tour du tableau et résout
 * d'office les exempts (bye) pour que l'avancement automatique fonctionne. Statut → 'bracket'.
 */
async function startDirectBracket(detail: TournamentDetail, playing: TournamentPlayer[]): Promise<void> {
  const { tournament } = detail;
  if (detail.matches.some((m) => m.phase === 'bracket')) return; // déjà généré (idempotent / course)

  // Seed = ELO décroissant, stocké dans `seed` (info d'affichage) ; pas de poule.
  const ranked = [...playing].sort(
    (a, b) => b.elo - a.elo || (a.player_id < b.player_id ? -1 : a.player_id > b.player_id ? 1 : 0),
  );
  for (let i = 0; i < ranked.length; i++) {
    await supabase
      .from('tournament_players')
      .update({ poule: null, seed: i + 1 })
      .eq('tournament_id', tournament.id)
      .eq('player_id', ranked[i].player_id);
  }

  const rows: Record<string, unknown>[] = seedDirectBracket(playing).map((p, i) => ({
    tournament_id: tournament.id,
    phase: 'bracket',
    round: 0,
    slot: i,
    player_a: p.playerA,
    player_b: p.playerB,
    winner: byeWinner(p.playerA, p.playerB), // exempt = gagné d'office → le joueur avance
  }));
  if (rows.length) {
    const { error } = await supabase.from('tournament_matches').insert(rows);
    if (error && error.code !== '23505') throw error; // 23505 = déjà généré (course) → ignore
  }
  await setTournamentStatus(tournament.id, 'bracket');
}

/** Crée le 1er tour du bracket à partir des qualifiés de poule (croisé 1ers/2es). */
async function generateBracketRound0(detail: TournamentDetail): Promise<void> {
  const qualifiers = detail.tournament.qualifiers_per_poule ?? 2;
  const rows: Record<string, unknown>[] = seedBracketRound0(detail.players, detail.matches, qualifiers).map((p, i) => ({
    tournament_id: detail.tournament.id,
    phase: 'bracket',
    round: 0,
    slot: i,
    player_a: p.playerA,
    player_b: p.playerB,
    winner: byeWinner(p.playerA, p.playerB), // exempt (ex. Top 3 qualifiés) = gagné d'office
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
