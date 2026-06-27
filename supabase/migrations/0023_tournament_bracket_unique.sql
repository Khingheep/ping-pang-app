-- Ping Pang Paris — garde-fou anti double-génération du bracket.
--
-- La génération poules→bracket (et tour→tour suivant) est pilotée côté app : si deux
-- participants valident le dernier match d'une phase quasi-simultanément, les deux
-- pourraient insérer le même tour. Cet index unique partiel rend l'insertion en double
-- impossible : la 2e tentative échoue (23505) et l'app l'ignore (la phase est déjà créée).
--
-- Partiel (phase='bracket') car les matchs de poule ont round/slot NULL.

create unique index if not exists uq_tmatches_bracket_slot
  on public.tournament_matches (tournament_id, round, slot)
  where phase = 'bracket';
