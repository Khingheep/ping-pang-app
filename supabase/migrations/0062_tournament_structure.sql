-- Ping Pang Paris — Mode de tournoi (formule) : poules + tableau (défaut) OU tableau direct.
--
--   'poules'  : comportement historique (round-robin en poules puis tableau des qualifiés).
--   'bracket' : élimination directe SANS poules, tableau seedé par ELO (le meilleur ELO = tête
--               de série 1). Placement « serpent » (demies 1-3 / 2-4) fait côté app.
--
-- Défaut 'poules' → tous les tournois existants gardent leur comportement.

alter table public.tournaments
  add column if not exists structure text not null default 'poules'
    check (structure in ('poules', 'bracket'));
