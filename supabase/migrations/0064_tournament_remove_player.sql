-- Ping Pang Paris — Retirer un inscrit d'un tournoi (phase inscriptions).
--
-- Besoin : en phase « open » (avant le lancement), l'organisateur veut pouvoir SUPPRIMER un
-- joueur ajouté par erreur. La RLS `tplayers leave` (0021) autorise déjà l'owner à retirer une
-- ligne `tournament_players` — MAIS un invité (is_guest) laisse alors une ligne `players`
-- orpheline (aucune policy DELETE sur `players`). Cette RPC SECURITY DEFINER fait le ménage
-- proprement, en une opération : retire l'inscription et supprime l'invité s'il n'a plus d'usage.
--
-- Garde-fous : réservé à l'owner, uniquement tant que le tournoi est « open » (une fois lancé, les
-- poules/tableau référencent les joueurs → on ne retire plus), et on ne retire jamais l'organisateur.

create or replace function public.remove_tournament_player(t_id uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  select * into t from public.tournaments where id = t_id;
  if t.id is null then
    raise exception 'tournoi introuvable';
  end if;
  if auth.uid() <> t.owner_id then
    raise exception 'non autorisé : réservé à l''organisateur';
  end if;
  if t.status <> 'open' then
    raise exception 'le tournoi a déjà commencé';
  end if;
  if target = t.owner_id then
    raise exception 'l''organisateur ne peut pas être retiré';
  end if;

  delete from public.tournament_players
    where tournament_id = t_id and player_id = target;

  -- Invité (sans compte) créé pour ce tournoi → on supprime la ligne joueur orpheline,
  -- sauf s'il est (par sécurité) encore rattaché à un autre tournoi.
  delete from public.players p
    where p.id = target
      and p.is_guest = true
      and not exists (
        select 1 from public.tournament_players tp where tp.player_id = p.id
      );
end;
$$;

grant execute on function public.remove_tournament_player(uuid, uuid) to authenticated;
