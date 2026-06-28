-- Ping Pang Paris — Lieux saisis à la main (hors base).
-- Quand un joueur ne trouve pas son terrain dans la recherche, il peut quand même
-- saisir un nom libre. On le stocke à deux endroits :
--   1. `training_sessions.venue_label` → pour afficher le lieu sur la séance (feed, historique).
--   2. `venue_suggestions`             → file de relecture côté dev pour ajouter le vrai
--                                        lieu à la base `venues` (avec GPS si dispo).

alter table public.training_sessions
  add column if not exists venue_label text;  -- lieu libre quand venue_id est null

create table if not exists public.venue_suggestions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  label      text not null,
  lat        double precision,  -- position du joueur au moment de la saisie (si permission accordée)
  lng        double precision,
  status     text not null default 'pending',  -- pending | added | rejected (traité côté dev)
  created_at timestamptz not null default now()
);

create index if not exists idx_venue_suggestions_status on public.venue_suggestions (status, created_at desc);

alter table public.venue_suggestions enable row level security;

-- Le joueur peut proposer un lieu (insert pour lui-même). La lecture/traitement reste
-- réservée au dev (service role / dashboard) : pas de policy select → file privée.
drop policy if exists "venue_suggestions insert own" on public.venue_suggestions;
create policy "venue_suggestions insert own" on public.venue_suggestions
  for insert with check (auth.uid() = player_id);
