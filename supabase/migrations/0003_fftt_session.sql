-- Ping Pang Paris — support du scraper FFTT (Mission 01)
-- Deux tables, accédées UNIQUEMENT par l'Edge Function `fftt` via la
-- service_role (qui contourne la RLS). Aucune policy publique : RLS activée
-- sans policy = personne d'autre n'y touche.

-- ───────────────── Session FFTT validée (singleton) ─────────────────
-- Le PHPSESSID validé par CAPTCHA, posé par le script Node `refresh-session`
-- et consommé par l'Edge Function. Une seule ligne (id = 1).
create table if not exists public.fftt_session (
  id           smallint primary key default 1,
  phpsessid    text not null,
  validated_at timestamptz not null default now(),
  expires_at   timestamptz,                         -- estimation d'expiration
  updated_at   timestamptz not null default now(),
  constraint fftt_session_singleton check (id = 1)
);

alter table public.fftt_session enable row level security;
-- (aucune policy → réservé à la service_role)

-- ───────────────── Cache des lookups FFTT ─────────────────
-- Évite de marteler FFTT : l'Edge Function lit/écrit ici avec un TTL.
-- `cache_key` ex : "search:nom=lebrun&sexe=Hommes" ou "player:3421810".
create table if not exists public.fftt_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_fftt_cache_fetched_at on public.fftt_cache (fetched_at);

alter table public.fftt_cache enable row level security;
-- (aucune policy → réservé à la service_role)
