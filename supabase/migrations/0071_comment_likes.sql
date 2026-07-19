-- Ping Pang Paris — « aces » sur les commentaires (séances + matchs).
-- Le focus post (Figma) affiche un pouce + compteur sur CHAQUE commentaire. Même modèle que
-- session_likes/match_likes : table de jointure (comment_id, player_id), lecture publique
-- (les aces sont publics), insert/delete réservés à soi. Cascade sur suppression du commentaire.

-- ── Séances ────────────────────────────────────────────────────────────────
create table if not exists public.session_comment_likes (
  comment_id uuid not null references public.session_comments (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, player_id)
);
create index if not exists idx_session_comment_likes_comment on public.session_comment_likes (comment_id);

alter table public.session_comment_likes enable row level security;
drop policy if exists "session_comment_likes read all" on public.session_comment_likes;
create policy "session_comment_likes read all" on public.session_comment_likes for select using (true);
drop policy if exists "session_comment_likes insert own" on public.session_comment_likes;
create policy "session_comment_likes insert own" on public.session_comment_likes
  for insert with check (auth.uid() = player_id);
drop policy if exists "session_comment_likes delete own" on public.session_comment_likes;
create policy "session_comment_likes delete own" on public.session_comment_likes
  for delete using (auth.uid() = player_id);

-- ── Matchs ─────────────────────────────────────────────────────────────────
create table if not exists public.match_comment_likes (
  comment_id uuid not null references public.match_comments (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, player_id)
);
create index if not exists idx_match_comment_likes_comment on public.match_comment_likes (comment_id);

alter table public.match_comment_likes enable row level security;
drop policy if exists "match_comment_likes read all" on public.match_comment_likes;
create policy "match_comment_likes read all" on public.match_comment_likes for select using (true);
drop policy if exists "match_comment_likes insert own" on public.match_comment_likes;
create policy "match_comment_likes insert own" on public.match_comment_likes
  for insert with check (auth.uid() = player_id);
drop policy if exists "match_comment_likes delete own" on public.match_comment_likes;
create policy "match_comment_likes delete own" on public.match_comment_likes
  for delete using (auth.uid() = player_id);
