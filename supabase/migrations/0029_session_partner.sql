-- Ping Pang Paris — Partenaire d'entraînement lié à un vrai joueur.
-- On peut désormais associer une séance à un partenaire qui est sur l'app
-- (partner_id). `partner_level` reste pour les partenaires hors-app (repli).

alter table public.training_sessions
  add column if not exists partner_id uuid references public.players (id) on delete set null;

create index if not exists idx_training_partner on public.training_sessions (partner_id);
