-- Suppression de compte propre : les FK vers players qui n'avaient PAS de ON DELETE
-- bloquaient la suppression d'un joueur (erreur 23503). On passe en ON DELETE SET NULL
-- → le match/historique reste, seule la référence au joueur parti est neutralisée.
-- (matches.player_a/_b cascadent déjà ; ici on traite winner + les colonnes de tournament_matches.)

alter table public.matches
  drop constraint if exists matches_winner_fkey,
  add constraint matches_winner_fkey
    foreign key (winner) references public.players (id) on delete set null;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_player_a_fkey,
  add constraint tournament_matches_player_a_fkey
    foreign key (player_a) references public.players (id) on delete set null;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_player_b_fkey,
  add constraint tournament_matches_player_b_fkey
    foreign key (player_b) references public.players (id) on delete set null;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_winner_fkey,
  add constraint tournament_matches_winner_fkey
    foreign key (winner) references public.players (id) on delete set null;
