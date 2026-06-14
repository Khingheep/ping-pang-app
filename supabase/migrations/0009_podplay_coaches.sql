-- Miroir des coachs PodPlay (Ping Pang Paris)
create table if not exists public.podplay_coaches (
  id          text primary key,
  first_name  text,
  last_name   text,
  slug        text,
  picture_url text,
  description text,
  tier_name   text,
  hourly_rate int,
  synced_at   timestamptz not null default now()
);
alter table public.podplay_coaches enable row level security;
drop policy if exists "coaches read all" on public.podplay_coaches;
create policy "coaches read all" on public.podplay_coaches for select using (true);
