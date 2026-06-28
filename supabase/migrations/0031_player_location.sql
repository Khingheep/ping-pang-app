-- Ping Pang Paris — position du joueur (pour « Joueurs près de toi » dans l'onglet Défis).
-- On stocke la dernière position connue (foreground) pour pouvoir trier les autres
-- joueurs par proximité. Renseignée depuis l'app quand la permission est accordée.

alter table public.players
  add column if not exists lat double precision,
  add column if not exists lng double precision;
