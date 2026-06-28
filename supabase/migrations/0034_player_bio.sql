-- Ping Pang Paris — biographie libre affichée sur le profil (remplace le type de joueur
-- comme sous-titre du hero quand elle est renseignée).

alter table public.players
  add column if not exists bio text;
