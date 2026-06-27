-- Ping Pang Paris — Feed social : les séances d'entraînement deviennent publiques
-- (accueil = feed de TOUT LE MONDE, pas seulement les amis, pour le MVP), avec photo
-- et likes.

-- 1. Séances lisibles par tous (l'écriture/suppression reste perso).
drop policy if exists "own training read" on public.training_sessions;
create policy "training read all" on public.training_sessions for select using (true);

alter table public.training_sessions
  add column if not exists photo_url text,
  add column if not exists is_solo   boolean not null default false;

-- 2. Likes sur les séances.
create table if not exists public.session_likes (
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create index if not exists idx_session_likes_session on public.session_likes (session_id);

alter table public.session_likes enable row level security;
drop policy if exists "session_likes read all" on public.session_likes;
create policy "session_likes read all" on public.session_likes for select using (true);
drop policy if exists "session_likes insert own" on public.session_likes;
create policy "session_likes insert own" on public.session_likes
  for insert with check (auth.uid() = player_id);
drop policy if exists "session_likes delete own" on public.session_likes;
create policy "session_likes delete own" on public.session_likes
  for delete using (auth.uid() = player_id);

-- 3. Bucket public pour les photos de séance (chemin = <user_id>/<uuid>.jpg).
insert into storage.buckets (id, name, public) values ('session-photos', 'session-photos', true)
  on conflict (id) do nothing;

drop policy if exists "session photo read"       on storage.objects;
drop policy if exists "session photo insert own" on storage.objects;
create policy "session photo read" on storage.objects for select using (bucket_id = 'session-photos');
create policy "session photo insert own" on storage.objects for insert
  with check (bucket_id = 'session-photos' and (storage.foldername(name))[1] = auth.uid()::text);
