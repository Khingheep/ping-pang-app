-- Ping Pang Paris — Clôture d'un défi une fois le match saisi.
--
-- Flow : sent → accepted (le receveur accepte) → « À jouer » (visible des 2 joueurs) → played.
-- Le passage accepted → played se fait quand l'un des deux joueurs saisit le score du match.
-- Or l'UPDATE direct de `challenges` est réservé au receveur (0006 : `ch update using to_player`),
-- et c'est souvent le PROPOSEUR du score (potentiellement le from_player) qui clôture.
-- → RPC SECURITY DEFINER, appelable par l'UN OU L'AUTRE des deux joueurs.
--
-- Le statut 'played' et la colonne `match_id` existent déjà (0001) ; pas de changement de schéma.

create or replace function public.close_challenge(p_challenge uuid, p_match uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenges
     set status = 'played',
         match_id = coalesce(p_match, match_id)
   where id = p_challenge
     and status = 'accepted'
     and (from_player = auth.uid() or to_player = auth.uid());
end;
$$;

grant execute on function public.close_challenge(uuid, uuid) to authenticated;
