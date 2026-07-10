-- Ping Pang Paris — Tagger PLUSIEURS partenaires sur une même séance.
-- `training_sessions.partner_id` reste le partenaire « principal » (rétrocompat feed /
-- templates / anciens clients) ; la liste complète vit dans cette table de jointure.

create table if not exists public.training_session_partners (
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create index if not exists idx_tsp_session on public.training_session_partners (session_id);
create index if not exists idx_tsp_player  on public.training_session_partners (player_id);

alter table public.training_session_partners enable row level security;

-- Lecture : ouverte, comme le feed des séances (`training read all`).
drop policy if exists "tsp read all" on public.training_session_partners;
create policy "tsp read all" on public.training_session_partners for select using (true);

-- Écriture / suppression : réservées au propriétaire de la séance parente
-- (le player_id de la ligne est le partenaire taggé, PAS l'auteur — d'où le sous-select).
drop policy if exists "tsp insert own session" on public.training_session_partners;
create policy "tsp insert own session" on public.training_session_partners
  for insert with check (
    exists (
      select 1 from public.training_sessions s
      where s.id = session_id and s.player_id = auth.uid()
    )
  );

drop policy if exists "tsp delete own session" on public.training_session_partners;
create policy "tsp delete own session" on public.training_session_partners
  for delete using (
    exists (
      select 1 from public.training_sessions s
      where s.id = session_id and s.player_id = auth.uid()
    )
  );
