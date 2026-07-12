-- Ping Pang Paris - Objectif hebdomadaire d'entrainement (minutes), configurable par joueur.
-- null = valeur par defaut cote app (3h). Editable par le joueur depuis la page Entrainement.
-- La policy "players update self" (RLS existante) autorise deja auth.uid() = id a modifier sa ligne.

alter table public.players
  add column if not exists weekly_goal_min int;
