-- Ping Pang Paris — social : défis, messages (DM realtime), notifications

-- ───────── Défis (challenges) ─────────
drop policy if exists "ch read" on public.challenges;
drop policy if exists "ch insert" on public.challenges;
drop policy if exists "ch update" on public.challenges;
create policy "ch read"   on public.challenges for select using (auth.uid() = from_player or auth.uid() = to_player);
create policy "ch insert" on public.challenges for insert with check (auth.uid() = from_player);
create policy "ch update" on public.challenges for update using (auth.uid() = to_player);

-- ───────── Messages (DM) ─────────
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null references public.players (id) on delete cascade,
  recipient  uuid not null references public.players (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "msg read" on public.messages;
drop policy if exists "msg insert" on public.messages;
create policy "msg read"   on public.messages for select using (auth.uid() = sender or auth.uid() = recipient);
create policy "msg insert" on public.messages for insert with check (auth.uid() = sender);
create index if not exists idx_msg_pair on public.messages (sender, recipient, created_at);
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when others then null; end $$;

-- ───────── Notifications ─────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "notif read" on public.notifications;
drop policy if exists "notif update" on public.notifications;
create policy "notif read"   on public.notifications for select using (auth.uid() = player_id);
create policy "notif update" on public.notifications for update using (auth.uid() = player_id);
create index if not exists idx_notif_player on public.notifications (player_id, created_at desc);

-- Triggers → notification auto
create or replace function public.notify_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.from_player;
  insert into notifications (player_id, type, title, body)
    values (new.to_player, 'challenge', 'Nouveau défi', coalesce(v_name, 'Un joueur') || ' t''a défié !');
  return new;
end; $$;
drop trigger if exists trg_notify_challenge on public.challenges;
create trigger trg_notify_challenge after insert on public.challenges
  for each row execute function notify_challenge();

create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.sender;
  insert into notifications (player_id, type, title, body)
    values (new.recipient, 'message', 'Nouveau message', coalesce(v_name, 'Quelqu''un') || ' : ' || left(new.body, 40));
  return new;
end; $$;
drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message after insert on public.messages
  for each row execute function notify_message();
