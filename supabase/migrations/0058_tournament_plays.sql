-- Ping Pang Paris — Organisateur « au desk » : gérer sans jouer + ajout direct d'un co-orga.
--
-- Complète 0057. Deux besoins :
--   1) Un organisateur (owner ou co-orga) peut GÉRER sans être tiré au sort dans les poules
--      → colonne `plays`. Le seeding (assignPoules) et le classement final n'incluent que
--        les participants qui jouent ; les autres restent au « desk » pour saisir les scores.
--   2) L'organisateur peut promouvoir un co-orga DIRECTEMENT (en piochant son compte), sans
--      l'obliger à rejoindre par code au préalable → `set_tournament_organizer` fait un upsert.
--      Un co-orga ajouté ainsi est « desk » par défaut (plays = false) : il gère, il ne joue pas
--      tant qu'on ne le bascule pas « joue ». Un participant déjà inscrit qu'on promeut garde
--      son statut de jeu.

alter table public.tournament_players
  add column if not exists plays boolean not null default true;

-- Promotion / rétrogradation d'un co-orga (owner only). Upsert : crée la ligne si absente
-- (ajout direct → desk par défaut), sinon ne touche qu'au flag organisateur.
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
  if value then
    insert into public.tournament_players (tournament_id, player_id, is_organizer, plays)
    values (t_id, target, true, false)
    on conflict (tournament_id, player_id) do update set is_organizer = true;
  else
    update public.tournament_players
      set is_organizer = false
      where tournament_id = t_id and player_id = target;
  end if;
end;
$$;

-- Bascule « joue / ne joue pas » d'un participant (owner only).
create or replace function public.set_tournament_plays(t_id uuid, target uuid, value boolean)
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
    set plays = value
    where tournament_id = t_id and player_id = target;
end;
$$;

grant execute on function public.set_tournament_plays(uuid, uuid, boolean) to authenticated;
