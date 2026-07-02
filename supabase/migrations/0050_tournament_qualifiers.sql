-- Ping Pang Paris — nombre de qualifiés par poule paramétrable (1, 2 ou 3) pour le tableau final.
-- Par défaut 2 (comportement historique). Lu au moment de générer le 1er tour du bracket.

alter table public.tournaments
  add column if not exists qualifiers_per_poule int not null default 2
    check (qualifiers_per_poule between 1 and 3);
