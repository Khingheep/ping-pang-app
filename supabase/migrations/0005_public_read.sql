-- Lecture publique des lieux & événements (écriture = service_role uniquement)
alter table public.venues enable row level security;
alter table public.events_ppp enable row level security;

drop policy if exists "venues read all" on public.venues;
drop policy if exists "events read all" on public.events_ppp;
create policy "venues read all" on public.venues for select using (true);
create policy "events read all" on public.events_ppp for select using (true);
