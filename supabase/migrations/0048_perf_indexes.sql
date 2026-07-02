-- Ping Pang Paris — index de performance (audit perf)

-- 1) Le feed des matchs (matches/feed.ts → fetchMatchesFeed) trie par `played_at desc`
--    SANS filtre joueur. Sans index dédié, Postgres fait un tri séquentiel qui devient
--    coûteux quand la table de matchs grossit. Index ciblé sur le tri du feed.
create index if not exists idx_matches_played_at on public.matches (played_at desc);

-- 2) Doublon d'index : `idx_training_player` (0004) et `idx_training_player_date` (0016)
--    sont STRICTEMENT identiques — (player_id, created_at desc). On supprime le plus ancien,
--    on garde la version v2. (Le nom d'index n'est jamais référencé en requête → drop sûr.)
drop index if exists idx_training_player;
