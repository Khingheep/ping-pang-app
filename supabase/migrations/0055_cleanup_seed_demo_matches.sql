-- Ping Pang Paris — retire les matchs de DÉMO (feeling='seed-demo') qui avaient été insérés
-- EN DUR sur les comptes perso (walid / walidtest / test1) par scripts/seed-match-scoreboards.sql.
-- Ces lignes portaient des elo_delta écrits à la main SANS jamais passer par _settle_match :
-- l'ELO réel des joueurs n'a donc jamais bougé, ce qui rendait le widget « 7 derniers jours »
-- (qui sommait ces deltas) incohérent avec l'ELO affiché. On supprime la fausse data.
-- Idempotent (le marqueur feeling='seed-demo' ne concerne que ces lignes de démo).

delete from public.match_comments where match_id in (select id from public.matches where feeling = 'seed-demo');
delete from public.match_likes    where match_id in (select id from public.matches where feeling = 'seed-demo');
delete from public.matches where feeling = 'seed-demo';
