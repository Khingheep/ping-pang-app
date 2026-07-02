-- Ping Pang Paris — historique du rating (snapshot à chaque changement d'ELO).
-- But : le widget « delta 7 jours » doit valoir (elo_courant − elo_il_y_a_7j), et NON la
-- somme des elo_delta stockés sur les matchs. Cette somme peut diverger du rating réel :
--   • arrondis Glicko-2 (delta par match = round(Δ) ≠ round(absolu)),
--   • écritures directes de l'ELO au lien FFTT / onboarding (aucun match créé),
--   • lignes de démo insérées en dur sans passer par _settle_match.
-- On snapshotte donc le rating à CHAQUE variation, quelle qu'en soit la source, et on calcule
-- le delta sur cet historique — seule source fiable.

create table if not exists public.rating_history (
  id            bigint generated always as identity primary key,
  player_id     uuid not null references public.players(id) on delete cascade,
  glicko_rating double precision not null,
  glicko_rd     double precision not null,
  elo           integer not null,
  reason        text,                       -- 'init' (backfill) | 'auto' (trigger)
  recorded_at   timestamptz not null default now()
);
create index if not exists idx_rating_history_player_time
  on public.rating_history (player_id, recorded_at desc);

alter table public.rating_history enable row level security;
drop policy if exists "rh read all" on public.rating_history;
create policy "rh read all" on public.rating_history for select using (true); -- l'ELO est déjà public
-- Écriture réservée au trigger (SECURITY DEFINER) : aucune policy insert/update/delete côté client.

-- Snapshot automatique : toute variation de glicko_rating ou elo (peu importe la source —
-- _settle_match, lien FFTT, onboarding, seed…) crée une ligne d'historique.
create or replace function public._snapshot_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.glicko_rating is distinct from old.glicko_rating
     or new.elo is distinct from old.elo then
    insert into public.rating_history (player_id, glicko_rating, glicko_rd, elo, reason)
    values (new.id, new.glicko_rating, new.glicko_rd,
            coalesce(new.elo, round(new.glicko_rating))::int, 'auto');
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_rating on public.players;
create trigger trg_snapshot_rating
  after insert or update of glicko_rating, elo on public.players
  for each row execute function public._snapshot_rating();

-- Baseline rétroactive : une ligne par joueur existant, datée à J-30, avec le rating ACTUEL.
-- => pour un joueur qui n'a pas changé d'ELO depuis, delta(7j) = elo − elo = 0 (correct).
-- (On ne peut pas reconstruire le passé ; l'historique réel démarre à partir de maintenant.)
insert into public.rating_history (player_id, glicko_rating, glicko_rd, elo, reason, recorded_at)
select p.id, p.glicko_rating, p.glicko_rd, p.elo, 'init', now() - interval '30 days'
from public.players p
where not exists (select 1 from public.rating_history rh where rh.player_id = p.id); -- idempotent

-- Delta d'ELO du joueur courant sur les `p_days` derniers jours, calculé sur l'historique :
--   = elo actuel − dernier snapshot antérieur à (now − p_days).
-- À défaut d'un snapshot assez ancien, on prend le tout premier snapshot connu (sa baseline).
create or replace function public.elo_delta_since(p_days int)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_now  integer;
  v_base integer;
begin
  if v_me is null then return 0; end if;
  select elo into v_now from public.players where id = v_me;
  if v_now is null then return 0; end if;

  select elo into v_base
  from public.rating_history
  where player_id = v_me and recorded_at <= now() - make_interval(days => p_days)
  order by recorded_at desc
  limit 1;

  if v_base is null then
    select elo into v_base
    from public.rating_history
    where player_id = v_me
    order by recorded_at asc
    limit 1;
  end if;

  return v_now - coalesce(v_base, v_now);
end $$;

grant execute on function public.elo_delta_since(int) to authenticated;
