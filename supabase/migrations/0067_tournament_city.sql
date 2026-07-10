-- Ping Pang Paris — Localisation d'un tournoi (ville).
--
-- Champ libre OPTIONNEL (comme players.city). Sert à filtrer « Mes tournois » par ville
-- quand un joueur en accumule beaucoup. Null = non renseigné (tournois existants inclus).

alter table public.tournaments
  add column if not exists city text;
