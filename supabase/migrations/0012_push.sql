-- Ping Pang Paris — pipeline de notifications push (Expo Push Service)
-- Stockage des tokens + déclenchement INSTANT à chaque notification via pg_net -> edge `push-send`.
-- ⚠️ La livraison réelle nécessite un dev build (Expo Go ne supporte plus le push distant).
--    Côté client, l'enregistrement du token no-op silencieusement tant qu'on est sur Expo Go.

create extension if not exists pg_net;

-- Tokens Expo push par joueur (un device = un token).
create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  token      text not null unique,
  platform   text,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists "push read own"   on public.push_tokens;
drop policy if exists "push insert own" on public.push_tokens;
drop policy if exists "push update own" on public.push_tokens;
drop policy if exists "push delete own" on public.push_tokens;
create policy "push read own"   on public.push_tokens for select using (auth.uid() = player_id);
create policy "push insert own" on public.push_tokens for insert with check (auth.uid() = player_id);
create policy "push update own" on public.push_tokens for update using (auth.uid() = player_id);
create policy "push delete own" on public.push_tokens for delete using (auth.uid() = player_id);

-- Suivi d'envoi sur les notifications.
alter table public.notifications add column if not exists pushed boolean not null default false;
create index if not exists idx_notif_unpushed on public.notifications (created_at) where pushed = false;

-- À chaque notification créée → POST async vers l'edge function push-send (livraison instantanée).
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://djwlpgvmmxmfbkvqbbyj.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  return new; -- ne jamais bloquer l'insert de la notif si pg_net échoue
end; $$;
drop trigger if exists trg_notify_push on public.notifications;
create trigger trg_notify_push after insert on public.notifications
  for each row execute function notify_push();
