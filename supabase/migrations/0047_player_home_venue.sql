-- Ping Pang Paris — club « maison » du joueur : un vrai lien vers un lieu (venue).
-- Distinct de fftt_club (simple nom texte issu de la licence) : ici on pointe un venue réel
-- (géoloc + page + créneaux), utilisé par la carte et le profil. NULL = aucun club défini.

alter table public.players
  add column if not exists home_venue_id uuid references public.venues(id) on delete set null;
