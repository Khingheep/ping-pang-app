-- ⚠️ DESTRUCTIF — remise à zéro des COMPTES avant le tournoi (Quentin 07/07/2026).
-- Vide tous les joueurs (vrais + invités) et tout ce qui s'y rattache, mais CONSERVE
-- les données de référence : venues, exercises, miroir FFTT (fftt_players / fftt_matches /
-- fftt_cache), events. À exécuter via :
--   node scripts/apply-sql.mjs "<conn-string>" scripts/wipe-accounts-tournament.sql
--
-- NB : depuis 0056, players n'a PLUS de FK vers auth.users → supprimer les users auth
-- ne cascade plus sur players (scripts/delete-accounts.mjs est donc insuffisant seul).
-- Ici on truncate players en cascade PUIS on vide les logins auth.

begin;

-- Emporte par cascade FK : matches, challenges, notifications, feed, training_sessions,
-- session_*, friends/follows, conversations/messages, slots, tournaments + inscriptions,
-- player_reports, rating_history, venue_suggestions…
truncate table public.players cascade;

-- feed_events ne référence pas players par FK (noms dénormalisés) → vidage explicite.
truncate table public.feed_events;

-- Logins (sessions/identités partent en cascade dans le schéma auth).
delete from auth.users;

commit;

-- APRÈS le wipe, une fois les comptes de l'équipe recréés dans l'app :
--   update public.players set is_admin = true where handle in ('walid', 'paul');
-- (les invités du tournoi se créent depuis l'app : bouton « rajouter un participant »)
