-- Sync quotidien des événements PodPlay (Ping Pang Paris) via l'edge function.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('podplay-events-daily')
where exists (select 1 from cron.job where jobname = 'podplay-events-daily');

select cron.schedule(
  'podplay-events-daily',
  '0 6 * * *', -- tous les jours à 06:00 UTC
  $$
    select net.http_post(
      url := 'https://djwlpgvmmxmfbkvqbbyj.supabase.co/functions/v1/podplay-sync',
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);
