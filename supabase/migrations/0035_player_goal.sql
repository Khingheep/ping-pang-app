-- Ping Pang Paris — objectif d'ELO défini manuellement par le joueur (carte « Objectif »
-- du profil). `goal_start_elo` fige l'ELO au moment où l'objectif est posé pour calculer
-- une vraie progression (de start → target). `goal_deadline` = 1er jour du mois cible.

alter table public.players
  add column if not exists goal_elo       int,
  add column if not exists goal_start_elo int,
  add column if not exists goal_deadline  date;
