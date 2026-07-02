-- Ping Pang Paris — Sécurise la saisie des scores de tournoi.
--
-- Avant : n'importe quel PARTICIPANT pouvait mettre à jour n'importe quel match du tournoi.
-- Maintenant :
--   1) Seul l'ORGANISATEUR ou l'un des DEUX JOUEURS du match peut le mettre à jour (= saisir son score).
--      L'INSERT reste ouvert aux participants : la génération du tour suivant du bracket est
--      déclenchée côté app par le joueur qui valide le dernier match d'un tour (pas que l'orga).
--   2) L'avancement du statut (poules → bracket → done) passe désormais par une fonction
--      SECURITY DEFINER réservée aux participants. Sinon seul l'organisateur pouvait faire
--      avancer les phases (l'UPDATE de `tournaments` est owner-only), et un joueur saisissant
--      le match décisif bloquait la suite du tournoi.

-- 1) Restriction de l'UPDATE des matchs : organisateur OU un des deux joueurs du match.
drop policy if exists "tmatches participant update" on public.tournament_matches;
drop policy if exists "tmatches score owner or players" on public.tournament_matches;
create policy "tmatches score owner or players" on public.tournament_matches
  for update using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_matches.tournament_id)
  );

-- 2) Avancement de phase réservé aux participants, via une fonction sécurisée
--    (contourne le owner-only de `tournaments` tout en validant l'appartenance au tournoi).
create or replace function public.set_tournament_status(t_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_status not in ('open', 'poules', 'bracket', 'done') then
    raise exception 'statut de tournoi invalide : %', new_status;
  end if;
  if not exists (
    select 1 from public.tournament_players tp
    where tp.tournament_id = t_id and tp.player_id = auth.uid()
  ) then
    raise exception 'non autorisé : tu ne participes pas à ce tournoi';
  end if;
  update public.tournaments set status = new_status where id = t_id;
end;
$$;

grant execute on function public.set_tournament_status(uuid, text) to authenticated;
