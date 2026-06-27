-- Ping Pang Paris — historique des matchs FFTT par joueur (Phase 1)
-- Persisté par l'edge function `fftt` (action=player) à chaque fetch live d'une
-- fiche détaillée. Upsert idempotent sur `match_uid` : re-scraper le même joueur
-- met à jour les lignes existantes sans créer de doublons.
--
-- `match_uid` = `<player>:<date ISO>:<adversaire>:<journée>`. En jeu individuel
-- FFTT un joueur n'affronte pas deux fois le même adversaire dans la même journée,
-- donc cette clé naturelle est stable entre deux scrapes (l'ordre de la liste,
-- lui, n'est PAS une clé fiable car un nouveau match décale tous les index).

create table if not exists public.fftt_matches (
  match_uid              text primary key,
  player_number_id       text not null,
  match_date             date,            -- normalisé depuis "JJ/MM/AA" (null si illisible)
  match_date_raw         text not null,   -- format FFTT brut conservé
  victoire               boolean,         -- true = V, false = D, null = indéterminé
  adversaire_number_id   text,
  adversaire_nom         text not null,
  adversaire_classement  text,            -- classement officiel adverse ("N26", "12"…)
  journee                integer,
  coefficient            numeric,
  gain_perte             numeric,         -- points gagnés/perdus sur ce match
  synced_at              timestamptz not null default now()
);

alter table public.fftt_matches enable row level security;
drop policy if exists "fftt_matches read all" on public.fftt_matches;
create policy "fftt_matches read all" on public.fftt_matches for select using (true);
-- écriture réservée à la service_role (via l'edge function) → aucune policy insert/update

create index if not exists idx_fftt_matches_player
  on public.fftt_matches (player_number_id, match_date desc);
create index if not exists idx_fftt_matches_adv
  on public.fftt_matches (adversaire_number_id);
