-- Ping Pang Paris — Co-organisateurs de tournoi (saisie des scores à plusieurs téléphones).
--
-- Avant (0044/0052) : seuls l'organisateur (owner) OU l'un des 2 joueurs d'un match pouvaient
-- en saisir le score. Pour gérer un event à plusieurs, l'organisateur peut désormais promouvoir
-- des participants « co-organisateurs » : ils saisissent le score de N'IMPORTE quel match du
-- tournoi (comme l'organisateur).
--
-- La promotion est réservée à l'organisateur (fonction sécurisée) : un participant ne peut pas
-- s'auto-promouvoir (sinon la policy update de tournament_players suffirait à tricher).

alter table public.tournament_players
  add column if not exists is_organizer boolean not null default false;

-- Saisie de score : owner, l'un des 2 joueurs, OU un co-organisateur du tournoi.
drop policy if exists "tmatches score owner or players" on public.tournament_matches;
create policy "tmatches score owner or players" on public.tournament_matches
  for update using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_matches.tournament_id)
    or exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = tournament_matches.tournament_id
        and tp.player_id = auth.uid()
        and tp.is_organizer
    )
  )
  with check (
    winner is null
    or winner = player_a
    or winner = player_b
  );

-- Promotion / rétrogradation d'un co-organisateur : organisateur (owner) uniquement.
create or replace function public.set_tournament_organizer(t_id uuid, target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> (select owner_id from public.tournaments where id = t_id) then
    raise exception 'non autorisé : réservé à l''organisateur';
  end if;
  update public.tournament_players
    set is_organizer = value
    where tournament_id = t_id and player_id = target;
end;
$$;

grant execute on function public.set_tournament_organizer(uuid, uuid, boolean) to authenticated;
