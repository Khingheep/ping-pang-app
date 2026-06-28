/**
 * Logique PURE des tournois (aucune dépendance Supabase / React Native) — testable en unitaire :
 * répartition serpent des poules, classement de poule, et seeding du bracket.
 * Les imports de types sont effacés à la compilation (pas de cycle runtime avec tournaments.ts).
 */

import type { PouleStanding, TournamentMatch, TournamentPlayer } from './tournaments';

export type BracketPair = { playerA: string | null; playerB: string | null };

/**
 * Nombre de poules à créer pour N joueurs : la plus grande puissance de 2 telle que
 * chaque poule garde ≥ 3 joueurs en moyenne. Conséquences :
 *  - taille de poule ∈ [3, 5] (parfois 6) → round-robin ni trop court ni trop long ;
 *  - nombre de poules = puissance de 2 → le tableau final est toujours « propre »
 *    (8→2 poules, 16→4, 24→8, 32→8, 48→16, 64→16…), sans bye bancal.
 */
export function numPoulesForPlayers(n: number): number {
  for (const P of [32, 16, 8, 4, 2]) {
    if (n >= P * 3) return P;
  }
  return 1;
}

/**
 * Répartition « serpent » par seed (ELO décroissant) dans `numPoules` poules, pour
 * équilibrer les niveaux. Les poules diffèrent d'au plus 1 joueur.
 */
export function assignPoules(
  players: TournamentPlayer[],
  numPoules: number,
): { player_id: string; poule: string; seed: number }[] {
  const sorted = [...players].sort((a, b) => b.elo - a.elo);
  const P = Math.max(1, numPoules);
  return sorted.map((p, i) => {
    const row = Math.floor(i / P);
    const col = i % P;
    const pouleIdx = row % 2 === 0 ? col : P - 1 - col; // serpent
    return { player_id: p.player_id, poule: String.fromCharCode(65 + pouleIdx), seed: i + 1 };
  });
}

/** Liste triée des poules présentes (A, B, C…). */
export function poulesOf(players: TournamentPlayer[]): string[] {
  return [...new Set(players.map((p) => p.poule).filter((x): x is string => !!x))].sort();
}

/** Classement d'une poule : V/D par joueur, trié par victoires puis défaites. */
export function computePouleStandings(
  players: TournamentPlayer[],
  matches: TournamentMatch[],
  poule: string,
): PouleStanding[] {
  const inPoule = players.filter((p) => p.poule === poule);
  const pouleMatches = matches.filter((m) => m.phase === 'poule' && m.poule === poule && m.winner);
  return inPoule
    .map((p) => {
      const played = pouleMatches.filter((m) => m.player_a === p.player_id || m.player_b === p.player_id);
      const wins = played.filter((m) => m.winner === p.player_id).length;
      return { playerId: p.player_id, name: p.name, played: played.length, wins, losses: played.length - wins };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

/**
 * Seeding du 1er tour : 2 premiers de chaque poule, croisés (1er d'une poule vs 2e d'une autre)
 * pour éviter qu'ils se rencontrent trop tôt. winners = [A1,B1,…], runners reversed = [B2,A2,…].
 */
export function seedBracketRound0(players: TournamentPlayer[], matches: TournamentMatch[]): BracketPair[] {
  const poules = poulesOf(players);
  const winners: string[] = [];
  const runners: string[] = [];
  for (const poule of poules) {
    const st = computePouleStandings(players, matches, poule);
    if (st[0]) winners.push(st[0].playerId);
    if (st[1]) runners.push(st[1].playerId);
  }
  runners.reverse();
  const n = Math.max(winners.length, runners.length);
  const pairs: BracketPair[] = [];
  for (let i = 0; i < n; i++) {
    pairs.push({ playerA: winners[i] ?? null, playerB: runners[i] ?? null });
  }
  return pairs;
}

/** Appariement des vainqueurs d'un tour (dans l'ordre des slots) → matchs du tour suivant. */
export function pairWinners(winners: string[]): BracketPair[] {
  const pairs: BracketPair[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push({ playerA: winners[i] ?? null, playerB: winners[i + 1] ?? null });
  }
  return pairs;
}
