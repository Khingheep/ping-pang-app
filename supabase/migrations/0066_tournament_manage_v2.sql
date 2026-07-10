-- Ping Pang Paris — Gestion de tournoi (v2) : format par phase, édition d'un invité, refaire le tirage.
--
-- Trois besoins issus des retours event :
--   1) FORMAT PAR PHASE : pouvoir jouer les poules dans un format (ex. BO3) et le tableau final dans
--      un autre (ex. BO5). On ajoute `bracket_format` (null = reprend `format`) + une RPC d'édition.
--   2) ÉDITER UN INVITÉ : corriger le nom et/ou l'ELO d'un invité déjà inscrit (le nom est cosmétique,
--      l'ELO sert au seeding du tableau direct / des têtes de série).
--   3) REFAIRE LE TIRAGE : remettre un tournoi lancé en « inscriptions » pour ajouter/retirer un
--      joueur oublié puis relancer — UNIQUEMENT tant qu'aucun vrai score n'a été saisi.
--
-- Toutes les écritures passent par des RPC SECURITY DEFINER gated `is_tournament_manager` (owner OU
-- co-orga, cf. 0065) : le DELETE de tournament_matches n'a aucune policy RLS, et un invité (uuid sans
-- compte) n'est pas modifiable via la policy `update own player` (auth.uid() = id).

-- ───────────────────────── 1) Format du tableau final ─────────────────────────

alter table public.tournaments
  add column if not exists bracket_format text
    check (bracket_format is null or bracket_format in ('bo1', 'bo3', 'bo5', 'bo7'));

-- Édition des formats (poules + tableau). `bracket_fmt` null → le tableau reprend le format des poules.
create or replace function public.set_tournament_formats(t_id uuid, poule_fmt text, bracket_fmt text)
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
  if t.status = 'done' then
    raise exception 'le tournoi est terminé';
  end if;
  if poule_fmt not in ('bo1', 'bo3', 'bo5', 'bo7') then
    raise exception 'format de poule invalide : %', poule_fmt;
  end if;
  if bracket_fmt is not null and bracket_fmt not in ('bo1', 'bo3', 'bo5', 'bo7') then
    raise exception 'format de tableau invalide : %', bracket_fmt;
  end if;
  update public.tournaments
    set format = poule_fmt,
        bracket_format = bracket_fmt
    where id = t_id;
end;
$$;

grant execute on function public.set_tournament_formats(uuid, text, text) to authenticated;

-- ───────────────────────── 2) Éditer un invité (nom + ELO) ─────────────────────────

create or replace function public.update_tournament_guest(
  t_id uuid,
  target uuid,
  guest_name text,
  guest_elo int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t     public.tournaments;
  clean text := btrim(coalesce(guest_name, ''));
begin
  select * into t from public.tournaments where id = t_id;
  if t.id is null then
    raise exception 'tournoi introuvable';
  end if;
  if not public.is_tournament_manager(t_id, auth.uid()) then
    raise exception 'non autorisé : réservé aux organisateurs';
  end if;
  -- Uniquement un INVITÉ inscrit à CE tournoi (on ne touche jamais au compte d'un vrai joueur).
  if not exists (
    select 1
    from public.tournament_players tp
    join public.players p on p.id = tp.player_id
    where tp.tournament_id = t_id and tp.player_id = target and p.is_guest = true
  ) then
    raise exception 'joueur non modifiable (invité de ce tournoi uniquement)';
  end if;
  if clean = '' then
    raise exception 'nom d''invité vide';
  end if;

  update public.players
    set display_name = clean,
        elo = case when guest_elo is null then elo else greatest(0, guest_elo) end
    where id = target and is_guest = true;
end;
$$;

grant execute on function public.update_tournament_guest(uuid, uuid, text, int) to authenticated;

-- ───────────────────────── 3) Refaire le tirage (retour en « open ») ─────────────────────────

create or replace function public.reset_tournament_to_open(t_id uuid)
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
  if t.status = 'open' then
    return; -- déjà en inscriptions → no-op
  end if;
  if t.status = 'done' then
    raise exception 'le tournoi est terminé';
  end if;
  -- Garde-fou : impossible dès qu'un VRAI résultat existe. On ignore les byes auto du tableau
  -- direct (un seul joueur présent) : ceux-là ont un winner mais pas deux joueurs.
  if exists (
    select 1 from public.tournament_matches m
    where m.tournament_id = t_id
      and m.winner is not null
      and m.player_a is not null
      and m.player_b is not null
  ) then
    raise exception 'impossible : des scores ont déjà été saisis';
  end if;

  delete from public.tournament_matches where tournament_id = t_id;
  update public.tournament_players set poule = null, seed = null where tournament_id = t_id;
  update public.tournaments set status = 'open' where id = t_id;
end;
$$;

grant execute on function public.reset_tournament_to_open(uuid) to authenticated;
