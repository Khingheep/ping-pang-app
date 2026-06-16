-- Ping Pang Paris — créneaux publics (Map) : un joueur propose un créneau dans un lieu,
-- les joueurs de la zone (filtrés par niveau) sont notifiés et peuvent rejoindre.

create table if not exists public.slots (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  host_id    uuid not null references public.players (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  format     text not null default '3sets',  -- ntt | 3sets | 2sets
  level_min  int,                             -- ELO min (null = pas de min)
  level_max  int,                             -- ELO max (null = pas de max)
  status     text not null default 'open',    -- open | cancelled
  created_at timestamptz not null default now()
);
alter table public.slots enable row level security;
drop policy if exists "slots read all"   on public.slots;
drop policy if exists "slots insert own"  on public.slots;
drop policy if exists "slots update own"  on public.slots;
drop policy if exists "slots delete own"  on public.slots;
create policy "slots read all"  on public.slots for select using (true);  -- créneaux publics
create policy "slots insert own" on public.slots for insert with check (auth.uid() = host_id);
create policy "slots update own" on public.slots for update using (auth.uid() = host_id);
create policy "slots delete own" on public.slots for delete using (auth.uid() = host_id);
create index if not exists idx_slots_venue  on public.slots (venue_id, starts_at);
create index if not exists idx_slots_starts on public.slots (starts_at);

create table if not exists public.slot_participants (
  slot_id   uuid not null references public.slots (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (slot_id, player_id)
);
alter table public.slot_participants enable row level security;
drop policy if exists "sp read all"   on public.slot_participants;
drop policy if exists "sp join self"  on public.slot_participants;
drop policy if exists "sp leave self" on public.slot_participants;
create policy "sp read all"   on public.slot_participants for select using (true);
create policy "sp join self"  on public.slot_participants for insert with check (auth.uid() = player_id);
create policy "sp leave self" on public.slot_participants for delete using (auth.uid() = player_id);

-- À la création : l'hôte devient participant + notif aux joueurs de la tranche de niveau.
create or replace function public.on_slot_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_venue text; v_when text;
begin
  insert into slot_participants (slot_id, player_id) values (new.id, new.host_id) on conflict do nothing;
  select display_name into v_name from players where id = new.host_id;
  select name into v_venue from venues where id = new.venue_id;
  v_when := to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM à HH24hMI');
  insert into notifications (player_id, type, title, body)
    select p.id, 'slot', 'Nouveau créneau',
           coalesce(v_name, 'Un joueur') || ' propose un créneau à ' || coalesce(v_venue, 'un lieu') || ' (' || v_when || ').'
    from players p
    where p.id <> new.host_id
      and (new.level_min is null or p.elo >= new.level_min)
      and (new.level_max is null or p.elo <= new.level_max);
  return new;
end; $$;
drop trigger if exists trg_on_slot_created on public.slots;
create trigger trg_on_slot_created after insert on public.slots
  for each row execute function on_slot_created();

-- Quand un joueur rejoint : notif à l'hôte.
create or replace function public.on_slot_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_host uuid; v_name text;
begin
  select host_id into v_host from slots where id = new.slot_id;
  if v_host is not null and v_host <> new.player_id then
    select display_name into v_name from players where id = new.player_id;
    insert into notifications (player_id, type, title, body)
      values (v_host, 'slot_join', 'Créneau rejoint', coalesce(v_name, 'Un joueur') || ' a rejoint ton créneau.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_on_slot_join on public.slot_participants;
create trigger trg_on_slot_join after insert on public.slot_participants
  for each row execute function on_slot_join();
