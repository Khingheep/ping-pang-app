-- Ping Pang Paris — Tournois (Événements) : création, rejoindre par code, poules, bracket.
--
-- Un tournoi se joue en 2 phases :
--   1. `poules`  : round-robin dans chaque poule (matchs `phase='poule'`).
--   2. `bracket` : élimination directe entre les 2 premiers de chaque poule
--                  (matchs `phase='bracket'`), débloqué quand les poules sont finies.
-- La génération poules→bracket et l'avancement du bracket sont pilotés côté app
-- (lib/tournaments). Le classement de poule (V/D) est calculé à l'affichage.

-- Discipline + formats étendus sur les défis (BO7 / Champions League déjà OK car `format` est du texte).
alter table public.challenges
  add column if not exists discipline text default 'ping-pong'; -- ping-pong | hardbat

create table if not exists public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,                 -- code d'invitation (6 car.)
  name              text not null,
  owner_id          uuid not null references public.players (id) on delete cascade,
  format            text not null default 'bo5',          -- bo3 | bo5 | bo7 | wtt | champions
  discipline        text not null default 'ping-pong',    -- ping-pong | hardbat
  max_players       int  not null default 8,
  players_per_poule int  not null default 4,
  is_ranked         boolean not null default false,       -- matchs comptés au classement ELO
  status            text not null default 'open',         -- open | poules | bracket | done
  created_at        timestamptz not null default now()
);

create table if not exists public.tournament_players (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  poule         text,                                     -- 'A','B',… (assignée au lancement)
  seed          int,
  joined_at     timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  phase         text not null,                            -- poule | bracket
  poule         text,                                     -- pour les matchs de poule
  round         int,                                      -- pour le bracket (0 = 1er tour)
  slot          int,                                      -- position dans le tour
  player_a      uuid references public.players (id),
  player_b      uuid references public.players (id),
  winner        uuid references public.players (id),
  score         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tournaments_code        on public.tournaments (code);
create index if not exists idx_tplayers_tournament     on public.tournament_players (tournament_id);
create index if not exists idx_tplayers_player         on public.tournament_players (player_id);
create index if not exists idx_tmatches_tournament     on public.tournament_matches (tournament_id);

-- ───────────────────────── RLS ─────────────────────────
alter table public.tournaments        enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;

-- Lecture ouverte (un tournoi est public dès qu'on a le code / depuis la liste).
drop policy if exists "tournaments read all" on public.tournaments;
create policy "tournaments read all" on public.tournaments for select using (true);
drop policy if exists "tplayers read all" on public.tournament_players;
create policy "tplayers read all" on public.tournament_players for select using (true);
drop policy if exists "tmatches read all" on public.tournament_matches;
create policy "tmatches read all" on public.tournament_matches for select using (true);

-- Création / gestion du tournoi réservée à son créateur.
drop policy if exists "tournaments insert own" on public.tournaments;
create policy "tournaments insert own" on public.tournaments
  for insert with check (auth.uid() = owner_id);
drop policy if exists "tournaments update owner" on public.tournaments;
create policy "tournaments update owner" on public.tournaments
  for update using (auth.uid() = owner_id);
drop policy if exists "tournaments delete owner" on public.tournaments;
create policy "tournaments delete owner" on public.tournaments
  for delete using (auth.uid() = owner_id);

-- On rejoint un tournoi en s'inscrivant soi-même ; le créateur peut aussi gérer les inscrits.
drop policy if exists "tplayers join self" on public.tournament_players;
create policy "tplayers join self" on public.tournament_players
  for insert with check (
    auth.uid() = player_id
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_id)
  );
drop policy if exists "tplayers manage" on public.tournament_players;
create policy "tplayers manage" on public.tournament_players
  for update using (
    auth.uid() = player_id
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_id)
  );
drop policy if exists "tplayers leave" on public.tournament_players;
create policy "tplayers leave" on public.tournament_players
  for delete using (
    auth.uid() = player_id
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_id)
  );

-- Les participants d'un tournoi peuvent créer/mettre à jour ses matchs (génération + scores).
drop policy if exists "tmatches participant write" on public.tournament_matches;
create policy "tmatches participant write" on public.tournament_matches
  for insert with check (
    exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = tournament_matches.tournament_id and tp.player_id = auth.uid()
    )
  );
drop policy if exists "tmatches participant update" on public.tournament_matches;
create policy "tmatches participant update" on public.tournament_matches
  for update using (
    exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = tournament_matches.tournament_id and tp.player_id = auth.uid()
    )
  );
