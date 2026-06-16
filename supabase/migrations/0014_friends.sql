-- Ping Pang Paris — amis (demande → acceptation) + pays (filtre classement)

-- Pays du joueur (pour le filtre "France"). Défaut France (app parisienne).
alter table public.players add column if not exists country text default 'France';
update public.players set country = 'France' where country is null;
-- backfill démo (joueurs internationaux pour le classement)
update public.players set country = 'Chine'     where city = 'Shanghai';
update public.players set country = 'Espagne'   where city = 'Madrid';
update public.players set country = 'Allemagne' where city = 'Berlin';
update public.players set country = 'Japon'     where city = 'Tokyo';

-- Amitiés : une ligne par demande, du requester vers l'addressee.
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.players (id) on delete cascade,
  addressee  uuid not null references public.players (id) on delete cascade,
  status     text not null default 'pending',  -- pending | accepted
  created_at timestamptz not null default now(),
  unique (requester, addressee)
);
alter table public.friendships enable row level security;
drop policy if exists "fr read"   on public.friendships;
drop policy if exists "fr insert" on public.friendships;
drop policy if exists "fr accept" on public.friendships;
drop policy if exists "fr delete" on public.friendships;
create policy "fr read"   on public.friendships for select using (auth.uid() = requester or auth.uid() = addressee);
create policy "fr insert" on public.friendships for insert with check (auth.uid() = requester and requester <> addressee);
create policy "fr accept" on public.friendships for update using (auth.uid() = addressee);          -- seul l'invité accepte
create policy "fr delete" on public.friendships for delete using (auth.uid() = addressee or auth.uid() = requester);
create index if not exists idx_fr_req  on public.friendships (requester);
create index if not exists idx_fr_addr on public.friendships (addressee);

-- Notif à l'invité quand une demande arrive.
create or replace function public.notify_friend_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.requester;
  insert into notifications (player_id, type, title, body)
    values (new.addressee, 'friend_request', 'Demande d''ami',
            coalesce(v_name, 'Un joueur') || ' veut t''ajouter en ami.');
  return new;
end; $$;
drop trigger if exists trg_notify_friend_request on public.friendships;
create trigger trg_notify_friend_request after insert on public.friendships
  for each row execute function notify_friend_request();

-- Notif au demandeur quand sa demande est acceptée.
create or replace function public.notify_friend_accept() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select display_name into v_name from players where id = new.addressee;
    insert into notifications (player_id, type, title, body)
      values (new.requester, 'friend_accepted', 'Demande acceptée 🎉',
              coalesce(v_name, 'Ton ami') || ' a accepté ta demande.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_friend_accept on public.friendships;
create trigger trg_notify_friend_accept after update on public.friendships
  for each row execute function notify_friend_accept();
