-- Ping Pang Paris — accusés de lecture des messages + temps réel sur les défis.
--
-- 1) Messages : deux horodatages d'accusé, façon WhatsApp.
--      • delivered_at : le destinataire a reçu le message sur son appareil (double coche grise)
--      • read_at      : le destinataire a ouvert la conversation (double coche bleue)
--    NULL = simple coche « envoyé ». Servent aussi à compter les messages non lus (pastille).
-- 2) Défis : on ajoute `challenges` à la publication realtime pour que l'onglet Défis du
--    destinataire se mette à jour en direct (sans attendre un refocus).

alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at      timestamptz;

-- Realtime doit émettre la ligne complète sur UPDATE (pour que l'expéditeur reçoive le
-- passage envoyé→reçu→lu de SES messages, filtrés par sender) et sur DELETE.
alter table public.messages   replica identity full;
alter table public.challenges replica identity full;

-- Index partiel : compteur de non-lus (recipient = moi, read_at null) instantané.
create index if not exists idx_msg_unread on public.messages (recipient) where read_at is null;

-- ───────── RPC d'accusés (security definer : seul le destinataire peut marquer) ─────────

-- Tous les messages d'une conversation reçus de `p_other` deviennent reçus ET lus.
create or replace function public.mark_thread_read(p_other uuid)
returns void language sql security definer set search_path = public as $$
  update public.messages
     set read_at      = coalesce(read_at, now()),
         delivered_at = coalesce(delivered_at, now())
   where recipient = auth.uid() and sender = p_other and read_at is null;
$$;
grant execute on function public.mark_thread_read to authenticated;

-- Marque « reçu » (sans lire) tous mes messages encore non livrés. Appelé quand le
-- destinataire est joignable (écran Messages / réception temps réel).
create or replace function public.mark_messages_delivered()
returns void language sql security definer set search_path = public as $$
  update public.messages
     set delivered_at = now()
   where recipient = auth.uid() and delivered_at is null;
$$;
grant execute on function public.mark_messages_delivered to authenticated;

-- ───────── Défis en temps réel ─────────
do $$ begin
  alter publication supabase_realtime add table public.challenges;
exception when duplicate_object then null; when others then null; end $$;
