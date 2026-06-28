-- Ping Pang Paris — champs FFTT additionnels exposés par le backend PingPocket.
-- Points temps réel / début de saison côté joueur ; compétition + fiabilité côté match.
-- Écriture réservée à la service_role (via l'edge function `fftt`) : pas de policy à ajouter.

alter table public.fftt_players
  add column if not exists points_rt    numeric,  -- realTimePoints (force la plus à jour)
  add column if not exists points_debut numeric;  -- firstStageOfficialPoints (début de phase)

alter table public.fftt_matches
  add column if not exists competition_nom   text,  -- ex. "FED_Championnat de France par Equipes Masculin"
  add column if not exists competition_sigle text,  -- ex. "FFEM"
  add column if not exists point_accuracy    text;  -- ex. "OFFICIAL"
