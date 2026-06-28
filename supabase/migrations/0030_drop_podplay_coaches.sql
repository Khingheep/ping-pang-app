-- Retrait des coachs PodPlay : l'app est un classement mondial du ping, pas une app de club.
-- cf. 0009_podplay_coaches.sql (table miroir désormais inutilisée).
drop table if exists public.podplay_coaches;
