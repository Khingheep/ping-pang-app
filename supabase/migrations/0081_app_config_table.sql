-- 0081 — config par environnement via TABLE (au lieu du paramètre `app.*` de 0080)
--
-- `alter database ... set app.functions_base_url` exige un superuser → refusé sur Supabase.
-- On stocke donc la valeur dans une table interne `app_config`, réglable par un simple INSERT
-- (donc via l'API / dashboard, sans superuser). `functions_base_url()` lit cette table ; le
-- trigger push et les crons (0080) appellent déjà cette fonction → ils basculent tout seuls.
--
-- Valeur à définir PAR ENVIRONNEMENT (hors migration) :
--   insert into public.app_config(key,value) values
--     ('functions_base_url','https://<ref>.supabase.co')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Table interne : RLS active, aucune policy → invisible aux clients anon/auth.
-- Les fonctions SECURITY DEFINER (owner postgres) et les crons la lisent sans souci.
alter table public.app_config enable row level security;

create or replace function public.functions_base_url() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_config where key = 'functions_base_url'
$$;
