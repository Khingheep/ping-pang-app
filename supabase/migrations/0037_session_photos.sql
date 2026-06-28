-- Ping Pang Paris — Plusieurs photos par séance.
-- On passe de `photo_url` (1 photo) à `photo_urls` (tableau ordonné, max 4 côté app).
-- `photo_url` est conservée (= 1re photo) pour la rétrocompat des anciens clients.

alter table public.training_sessions
  add column if not exists photo_urls text[] not null default '{}';

-- Backfill : les séances déjà en base récupèrent leur unique photo dans le tableau.
update public.training_sessions
  set photo_urls = array[photo_url]
  where photo_url is not null
    and (photo_urls is null or array_length(photo_urls, 1) is null);
