-- Ping Pang Paris — miroir local des joueurs FFTT (Phase 1)
-- Rempli au fil des recherches live (l'edge function `fftt` y upsert), pour
-- offrir un typeahead instantané (3 lettres) sans dépendre de la session live.

create extension if not exists pg_trgm;

create table if not exists public.fftt_players (
  number_id     text primary key,
  nom           text not null,
  prenom        text not null,
  club_nom      text,
  sexe          text,            -- 'H' | 'F'
  classement    text,            -- classement officiel (ex "N1", "12")
  points_off    integer,
  points_men    numeric,
  rang_national integer,
  categorie     text,
  synced_at     timestamptz not null default now()
);

alter table public.fftt_players enable row level security;
drop policy if exists "fftt_players read all" on public.fftt_players;
create policy "fftt_players read all" on public.fftt_players for select using (true);
-- écriture réservée à la service_role (via l'edge function) → aucune policy insert/update

create index if not exists idx_fftt_players_nom_trgm    on public.fftt_players using gin (nom gin_trgm_ops);
create index if not exists idx_fftt_players_prenom_trgm on public.fftt_players using gin (prenom gin_trgm_ops);
