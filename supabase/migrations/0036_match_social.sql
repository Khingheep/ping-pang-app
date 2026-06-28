-- Ping Pang Paris — Social sur les matchs : likes + commentaires (même modèle que les séances).
-- Un match est privé (RLS = seulement ses 2 joueurs le voient) ; les réactions restent donc
-- entre les deux participants. On notifie l'AUTRE joueur quand l'un réagit.

-- 1. Likes sur les matchs.
create table if not exists public.match_likes (
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.match_likes enable row level security;
drop policy if exists "match_likes read all" on public.match_likes;
create policy "match_likes read all" on public.match_likes for select using (true);
drop policy if exists "match_likes insert own" on public.match_likes;
create policy "match_likes insert own" on public.match_likes
  for insert with check (auth.uid() = player_id);
drop policy if exists "match_likes delete own" on public.match_likes;
create policy "match_likes delete own" on public.match_likes
  for delete using (auth.uid() = player_id);

-- 2. Commentaires sur les matchs.
create table if not exists public.match_comments (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_match_comments_match on public.match_comments (match_id, created_at);

alter table public.match_comments enable row level security;
drop policy if exists "match_comments read all" on public.match_comments;
create policy "match_comments read all" on public.match_comments for select using (true);
drop policy if exists "match_comments insert own" on public.match_comments;
create policy "match_comments insert own" on public.match_comments
  for insert with check (auth.uid() = player_id);
drop policy if exists "match_comments delete own" on public.match_comments;
create policy "match_comments delete own" on public.match_comments
  for delete using (auth.uid() = player_id);

-- 3. Notifie l'autre joueur du match (celui qui n'a pas réagi).
create or replace function public.notify_match_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_a uuid; v_b uuid; v_target uuid;
begin
  select player_a, player_b into v_a, v_b from matches where id = new.match_id;
  v_target := case when new.player_id = v_a then v_b else v_a end;
  if v_target is null or v_target = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body)
    values (v_target, 'match_comment', 'Nouveau commentaire',
            coalesce(v_name, 'Quelqu''un') || ' a commenté votre match : ' || left(new.body, 40));
  return new;
end; $$;
drop trigger if exists trg_notify_match_comment on public.match_comments;
create trigger trg_notify_match_comment after insert on public.match_comments
  for each row execute function notify_match_comment();

create or replace function public.notify_match_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_a uuid; v_b uuid; v_target uuid;
begin
  select player_a, player_b into v_a, v_b from matches where id = new.match_id;
  v_target := case when new.player_id = v_a then v_b else v_a end;
  if v_target is null or v_target = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body)
    values (v_target, 'match_like', 'Nouveau j''aime',
            coalesce(v_name, 'Quelqu''un') || ' a aimé votre match');
  return new;
end; $$;
drop trigger if exists trg_notify_match_like on public.match_likes;
create trigger trg_notify_match_like after insert on public.match_likes
  for each row execute function notify_match_like();
