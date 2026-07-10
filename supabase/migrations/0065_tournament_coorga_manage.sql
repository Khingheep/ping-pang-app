-- Ping Pang Paris — Un co-organisateur gère la phase inscriptions comme l'organisateur.
--
-- Contexte : jusqu'ici toute la gestion des inscrits (ajouter un joueur existant, ajouter un
-- invité, retirer un inscrit, lancer le tournoi) était réservée à l'OWNER. Un co-organisateur
-- (tournament_players.is_organizer = true, cf. 0057) ne voyait donc pas l'écran « Ajouter » et
-- ses écritures étaient bloquées par la RLS. On élargit ces droits aux « managers » (owner OU
-- co-orga). La gestion des RÔLES (promouvoir un co-orga, basculer joue/desk) reste à l'owner.

-- Helper : `uid` gère-t-il ce tournoi ? SECURITY DEFINER → utilisable dans les policies de
-- tournament_players SANS récursion RLS (la fonction s'exécute avec les droits du propriétaire).
create or replace function public.is_tournament_manager(t_id uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t where t.id = t_id and t.owner_id = uid
  ) or exists (
    select 1 from public.tournament_players tp
    where tp.tournament_id = t_id and tp.player_id = uid and tp.is_organizer = true
  );
$$;

grant execute on function public.is_tournament_manager(uuid, uuid) to authenticated;

-- INSERT : on rejoint soi-même OU un manager inscrit des joueurs.
drop policy if exists "tplayers join self" on public.tournament_players;
create policy "tplayers join self" on public.tournament_players
  for insert with check (
    auth.uid() = player_id
    or public.is_tournament_manager(tournament_id, auth.uid())
  );

-- UPDATE : sa propre ligne OU un manager (nécessaire au lancement : écrit poule/seed de tous).
drop policy if exists "tplayers manage" on public.tournament_players;
create policy "tplayers manage" on public.tournament_players
  for update using (
    auth.uid() = player_id
    or public.is_tournament_manager(tournament_id, auth.uid())
  );

-- DELETE : un manager peut retirer un inscrit (l'RPC remove_tournament_player protège l'owner).
drop policy if exists "tplayers leave" on public.tournament_players;
create policy "tplayers leave" on public.tournament_players
  for delete using (
    auth.uid() = player_id
    or public.is_tournament_manager(tournament_id, auth.uid())
  );

-- Ajout d'un invité : owner OU co-orga (remplace le check owner-only de 0056).
create or replace function public.create_tournament_guest(
  t_id uuid,
  guest_name text,
  guest_elo int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tournaments;
  new_id uuid := gen_random_uuid();
  n      int;
  clean  text := btrim(coalesce(guest_name, ''));
begin
  select * into t from public.tournaments where id = t_id;
  if t.id is null then
    raise exception 'tournoi introuvable';
  end if;
  if not public.is_tournament_manager(t_id, auth.uid()) then
    raise exception 'non autorisé : réservé aux organisateurs';
  end if;
  if t.status <> 'open' then
    raise exception 'le tournoi a déjà commencé';
  end if;
  if clean = '' then
    raise exception 'nom d''invité vide';
  end if;

  select count(*) into n from public.tournament_players where tournament_id = t_id;
  if n >= t.max_players then
    raise exception 'le tournoi est complet';
  end if;

  insert into public.players (id, handle, display_name, elo, is_guest, created_by)
  values (
    new_id,
    'invite_' || replace(new_id::text, '-', ''),
    clean,
    greatest(0, coalesce(guest_elo, 1200)),
    true,
    auth.uid()
  );

  insert into public.tournament_players (tournament_id, player_id)
  values (t_id, new_id);

  return new_id;
end;
$$;

-- Retrait d'un inscrit : owner OU co-orga (remplace le check owner-only de 0064).
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
  if not public.is_tournament_manager(t_id, auth.uid()) then
    raise exception 'non autorisé : réservé aux organisateurs';
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
