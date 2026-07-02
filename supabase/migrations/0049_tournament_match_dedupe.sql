-- Ping Pang Paris — fiabilise les matchs de tournoi : supprime les doublons existants puis
-- pose des index uniques pour qu'un double-lancement (ou une course entre participants) ne
-- puisse plus jamais insérer deux fois la même rencontre (bug observé : poule de 3 → 6 matchs).

-- 1. Dédoublonne les matchs de POULE : on garde, pour chaque (tournoi, poule, paire de joueurs),
--    la ligne déjà jouée (winner non nul) la plus ancienne ; on supprime le reste.
delete from public.tournament_matches
where id in (
  select id from (
    select id,
      row_number() over (
        partition by tournament_id, poule,
                     least(player_a, player_b), greatest(player_a, player_b)
        order by (winner is not null) desc, created_at asc
      ) as rn
    from public.tournament_matches
    where phase = 'poule'
  ) s
  where s.rn > 1
);

-- 2. Dédoublonne les matchs de BRACKET sur (tournoi, tour, slot), même priorité.
delete from public.tournament_matches
where id in (
  select id from (
    select id,
      row_number() over (
        partition by tournament_id, round, slot
        order by (winner is not null) desc, created_at asc
      ) as rn
    from public.tournament_matches
    where phase = 'bracket'
  ) s
  where s.rn > 1
);

-- 3. Index uniques (partiels) : un seul match par paire de poule, un seul par slot de bracket.
--    least/greatest → indépendant de l'ordre player_a / player_b.
create unique index if not exists uniq_poule_match
  on public.tournament_matches (tournament_id, poule, least(player_a, player_b), greatest(player_a, player_b))
  where phase = 'poule';

create unique index if not exists uniq_bracket_slot
  on public.tournament_matches (tournament_id, round, slot)
  where phase = 'bracket';
