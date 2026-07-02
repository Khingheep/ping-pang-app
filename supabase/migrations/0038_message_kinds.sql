-- Ping Pang Paris — Messages riches dans le chat.
--
-- Un message reste `{ sender, recipient, body, created_at }` mais gagne deux champs :
--   • kind    : 'text' (défaut) | 'image' | 'gif' | 'challenge' | 'match_result'
--   • payload : données structurées de la carte (url image, challengeId, matchId, score…)
--
-- `body` reste NOT NULL et sert TOUJOURS de résumé lisible (ex. "🏓 Défi BO5", "📷 Photo",
-- "Score 3-1"). C'est ce résumé qu'utilisent déjà la liste des conversations (lastBody) et
-- le trigger de notification `notify_message` (left(body, 40)) — rien à changer de ce côté.

alter table public.messages
  add column if not exists kind    text not null default 'text',
  add column if not exists payload jsonb;

-- Garde-fou : seuls les types connus sont acceptés.
do $$ begin
  alter table public.messages
    add constraint messages_kind_check
    check (kind in ('text', 'image', 'gif', 'challenge', 'match_result'));
exception when duplicate_object then null; end $$;

-- ───────── Bucket public pour les médias de chat (photos + GIFs uploadés) ─────────
-- Chemin = <user_id>/<uuid>.jpg, comme avatars/ et session-photos/.
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
  on conflict (id) do nothing;

drop policy if exists "chat media read"       on storage.objects;
drop policy if exists "chat media insert own" on storage.objects;
create policy "chat media read" on storage.objects for select using (bucket_id = 'chat-media');
create policy "chat media insert own" on storage.objects for insert
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);
