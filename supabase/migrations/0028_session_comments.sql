-- Ping Pang Paris — Feed social : commentaires sur les séances + notifications
-- pour likes & commentaires (l'auteur de la séance voit qui réagit).

-- 1. Commentaires sur les séances.
create table if not exists public.session_comments (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_session_comments_session on public.session_comments (session_id, created_at);

alter table public.session_comments enable row level security;
drop policy if exists "session_comments read all" on public.session_comments;
create policy "session_comments read all" on public.session_comments for select using (true);
drop policy if exists "session_comments insert own" on public.session_comments;
create policy "session_comments insert own" on public.session_comments
  for insert with check (auth.uid() = player_id);
drop policy if exists "session_comments delete own" on public.session_comments;
create policy "session_comments delete own" on public.session_comments
  for delete using (auth.uid() = player_id);

-- 2. Notification quand quelqu'un commente ta séance (sauf toi-même).
create or replace function public.notify_session_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_author uuid;
begin
  select player_id into v_author from training_sessions where id = new.session_id;
  if v_author is null or v_author = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body)
    values (v_author, 'session_comment', 'Nouveau commentaire',
            coalesce(v_name, 'Quelqu''un') || ' a commenté ta séance : ' || left(new.body, 40));
  return new;
end; $$;
drop trigger if exists trg_notify_session_comment on public.session_comments;
create trigger trg_notify_session_comment after insert on public.session_comments
  for each row execute function notify_session_comment();

-- 3. Notification quand quelqu'un aime ta séance (sauf toi-même).
create or replace function public.notify_session_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_author uuid;
begin
  select player_id into v_author from training_sessions where id = new.session_id;
  if v_author is null or v_author = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body)
    values (v_author, 'session_like', 'Nouveau j''aime',
            coalesce(v_name, 'Quelqu''un') || ' a aimé ta séance');
  return new;
end; $$;
drop trigger if exists trg_notify_session_like on public.session_likes;
create trigger trg_notify_session_like after insert on public.session_likes
  for each row execute function notify_session_like();
