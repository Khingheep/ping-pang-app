-- Ping Pang Paris — Entraînements v2 (design Figma) : coups travaillés, niveau du
-- partenaire, lieu. feeling passe de l'emoji aux labels (Difficile/Moyen/Bien/Excellent).

alter table public.training_sessions
  add column if not exists strokes       text[] not null default '{}',  -- coups travaillés
  add column if not exists partner_level text,                          -- niveau du partenaire
  add column if not exists venue_id      uuid references public.venues (id) on delete set null;

-- Le nouveau flux ne renseigne plus `kind` (remplacé par les coups travaillés).
alter table public.training_sessions alter column kind drop not null;

create index if not exists idx_training_player_date on public.training_sessions (player_id, created_at desc);
