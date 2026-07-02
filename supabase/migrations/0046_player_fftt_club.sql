-- Ping Pang Paris — club FFTT du joueur, affiché sur le profil sous le nom.
-- Renseigné au lien FFTT (depuis p.club.nom) ; effacé au délien. NULL = non licencié / club inconnu.

alter table public.players
  add column if not exists fftt_club text;
