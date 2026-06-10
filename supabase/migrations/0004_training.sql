-- Ping Pang Paris — entraînements (Mission 02 · Dashboard Training)
create table if not exists public.training_sessions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  kind        text not null,            -- match | solo | jonglage | fitness
  duration_min int not null default 30,
  feeling     text,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.training_sessions enable row level security;

drop policy if exists "own training read" on public.training_sessions;
drop policy if exists "own training insert" on public.training_sessions;
drop policy if exists "own training delete" on public.training_sessions;
create policy "own training read"   on public.training_sessions for select using (auth.uid() = player_id);
create policy "own training insert" on public.training_sessions for insert with check (auth.uid() = player_id);
create policy "own training delete" on public.training_sessions for delete using (auth.uid() = player_id);

create index if not exists idx_training_player on public.training_sessions (player_id, created_at desc);
