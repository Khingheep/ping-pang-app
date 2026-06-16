-- Ping Pang Paris — compte : préférences (confidentialité + notifications) + ressenti post-match.

alter table public.players
  add column if not exists profile_public   boolean not null default true,
  add column if not exists stats_visible    boolean not null default true,
  add column if not exists visible_on_map   boolean not null default true,
  add column if not exists share_elo        boolean not null default true,
  add column if not exists notif_challenges boolean not null default true,
  add column if not exists notif_results    boolean not null default true;

-- Ressenti + notes post-match, par joueur.
create table if not exists public.match_feedback (
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  feeling    text,
  note       text,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
alter table public.match_feedback enable row level security;
drop policy if exists "mf read own"   on public.match_feedback;
drop policy if exists "mf insert own" on public.match_feedback;
drop policy if exists "mf update own" on public.match_feedback;
create policy "mf read own"   on public.match_feedback for select using (auth.uid() = player_id);
create policy "mf insert own" on public.match_feedback for insert with check (auth.uid() = player_id);
create policy "mf update own" on public.match_feedback for update using (auth.uid() = player_id);
