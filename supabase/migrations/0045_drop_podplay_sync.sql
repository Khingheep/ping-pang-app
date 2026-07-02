-- Suppression de la synchro PodPlay : l'app est un classement/réseau ping mondial,
-- la section « Événements » a été retirée de l'onglet Parties et l'edge function
-- podplay-sync supprimée. On désinscrit le cron qui l'appelait quotidiennement.
-- cf. 0008_podplay_cron.sql (job désormais inutile).
select cron.unschedule('podplay-events-daily')
where exists (select 1 from cron.job where jobname = 'podplay-events-daily');

-- La table cible de la synchro n'est plus lue par l'app (section Événements retirée).
-- cf. 0001_init.sql (création) + 0005_public_read.sql (policy « events read all »).
drop table if exists public.events_ppp cascade;
