-- 0080 — URL des Edge Functions dépendante de l'ENVIRONNEMENT (fin du hardcode prod)
--
-- 0008/0012/0075 hardcodaient `https://djwlpgvmmxmfbkvqbbyj.supabase.co` (= PROD) dans le
-- trigger push et les crons. Sur STAGING, cela pingait les fonctions de PROD (qui lisent la DB
-- de prod) → fuite inter-environnement. On lit désormais l'URL depuis un paramètre de base de
-- données, à définir PAR ENVIRONNEMENT (hors migration, cf. RENAME/PROD checklist) :
--
--   staging : alter database postgres set app.functions_base_url = 'https://ytcnlidttxzvbpeosmhx.supabase.co';
--   prod    : alter database postgres set app.functions_base_url = 'https://djwlpgvmmxmfbkvqbbyj.supabase.co';
--
-- Tant que le paramètre n'est pas défini sur un env, push/cron sont INERTES (aucun POST) —
-- donc aucune fuite, aucun crash. On ne définit PAS le paramètre ici (sinon la valeur serait
-- partagée entre les deux environnements).

-- Base URL des Edge Functions pour l'environnement courant (NULL si non configuré).
create or replace function public.functions_base_url() returns text
language sql stable as $$
  select nullif(current_setting('app.functions_base_url', true), '')
$$;

-- Trigger push (remplace 0075) : URL dérivée de l'environnement.
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_base text := public.functions_base_url();
begin
  if v_base is null then
    return null;                       -- env non configuré → no-op (pas de fuite)
  end if;
  perform net.http_post(
    url     := v_base || '/functions/v1/push-send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb             -- pas d'id → mode scan (batch) côté edge
  );
  return null;                         -- trigger statement : retour ignoré
exception when others then
  return null;                         -- ne jamais bloquer l'insert de la notif
end; $$;
-- (le trigger trg_notify_push de 0075 pointe déjà vers notify_push() → inchangé)

-- Cron push-drain : filet de sécurité toutes les minutes, URL dérivée de l'env.
select cron.unschedule('push-drain')
where exists (select 1 from cron.job where jobname = 'push-drain');
select cron.schedule('push-drain', '* * * * *', $CRON$
  select net.http_post(
    url     := public.functions_base_url() || '/functions/v1/push-send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  where public.functions_base_url() is not null
    and exists (select 1 from public.notifications where pushed = false);
$CRON$);

-- NB : on ne touche PAS au cron `podplay-events-daily` — il a été volontairement supprimé en
-- 0045 (fonction podplay-sync retirée, section Événements abandonnée). Ne pas le ré-inscrire.
