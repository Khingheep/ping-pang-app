-- Ping Pang Paris — schéma initial (Missions 00 / 01)
-- Postgres / Supabase. Exécuter via `supabase db push` ou l'éditeur SQL Supabase.

-- Profil joueur (lié à auth.users)
create table if not exists public.players (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        text unique not null,
  display_name  text not null,
  avatar_url    text,
  city          text default 'Paris',
  play_style    text,                 -- offensif | défensif | allround
  handedness    text,                 -- droitier | gaucher
  fftt_id       text,                 -- n° licence FFTT
  fftt_points   integer,              -- classement officiel importé (Mission 01)
  elo           integer not null default 1200,
  level         text    not null default 'rookie',
  is_premium    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Matchs (défis 1v1 / amicaux / classés)
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  player_a       uuid not null references public.players (id) on delete cascade,
  player_b       uuid not null references public.players (id) on delete cascade,
  winner         uuid references public.players (id),
  score          text,                -- ex "3-1" (sets)
  best_of        smallint default 5,
  is_ranked      boolean not null default true,
  elo_delta_a    integer,
  elo_delta_b    integer,
  feeling        text,                -- feeling post-match
  status         text not null default 'pending',  -- pending | confirmed | disputed
  confirmed_by_a boolean not null default false,
  confirmed_by_b boolean not null default false,
  played_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Défis envoyés (Mission 04)
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  from_player uuid not null references public.players (id) on delete cascade,
  to_player   uuid not null references public.players (id) on delete cascade,
  message     text,
  status      text not null default 'sent',  -- sent | accepted | declined | played
  match_id    uuid references public.matches (id),
  created_at  timestamptz not null default now()
);

-- Lieux de jeu (Mission 03 — Carte)
create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  indoor     boolean default true,
  source     text,                    -- pingpongmap | manuel
  created_at timestamptz not null default now()
);

-- Événements Ping Pang Paris (sync Podplay)
create table if not exists public.events_ppp (
  id          uuid primary key default gen_random_uuid(),
  external_id text unique,            -- id Podplay
  title       text not null,
  venue_id    uuid references public.venues (id),
  starts_at   timestamptz,
  spots_left  integer,
  url         text,
  created_at  timestamptz not null default now()
);

-- Suivi entre joueurs (feed social — Sprint 2)
create table if not exists public.follows (
  follower   uuid not null references public.players (id) on delete cascade,
  following  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, following)
);

create index if not exists idx_matches_player_a on public.matches (player_a);
create index if not exists idx_matches_player_b on public.matches (player_b);
create index if not exists idx_players_elo       on public.players (elo desc);

-- ───────────────────────── RLS (à affiner) ─────────────────────────
alter table public.players    enable row level security;
alter table public.matches    enable row level security;
alter table public.challenges enable row level security;
alter table public.follows    enable row level security;

-- Profils & classement lisibles par tous
create policy "players readable by all" on public.players for select using (true);
-- Chacun gère uniquement son profil
create policy "insert own player" on public.players for insert with check (auth.uid() = id);
create policy "update own player" on public.players for update using (auth.uid() = id);
