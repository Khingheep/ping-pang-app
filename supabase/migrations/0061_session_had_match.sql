-- Ping Pang Paris — Flag « as-tu fait un match pendant l'entraînement ? »
-- Sert uniquement aux stats de fin de saison (ex : « matchs à 80% de tes
-- entraînements »). Pas affiché dans le feed pour le moment.
-- Default false : les séances existantes comptent comme « sans match ».

alter table public.training_sessions
  add column if not exists had_match boolean not null default false;
