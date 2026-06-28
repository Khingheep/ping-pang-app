-- Ping Pang Paris — gestion des conversations : blocage, archivage, suppression (côté utilisateur)
--
-- Les conversations sont dérivées de la table `messages` (pas de table dédiée).
-- On ajoute donc deux tables d'état par utilisateur, sans jamais détruire les messages
-- de l'autre personne :
--   • blocked_users        : qui bloque qui
--   • conversation_states  : archivage + "suppression" (cleared_at) propre à chaque côté

-- ───────── Blocage d'utilisateurs ─────────
create table if not exists public.blocked_users (
  blocker    uuid not null references public.players (id) on delete cascade,
  blocked    uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocked_users enable row level security;
drop policy if exists "blk read"   on public.blocked_users;
drop policy if exists "blk insert" on public.blocked_users;
drop policy if exists "blk delete" on public.blocked_users;
-- Chacun ne voit/gère que SES propres blocages.
create policy "blk read"   on public.blocked_users for select using (auth.uid() = blocker);
create policy "blk insert" on public.blocked_users for insert with check (auth.uid() = blocker);
create policy "blk delete" on public.blocked_users for delete using (auth.uid() = blocker);

-- ───────── État de conversation par utilisateur (archive + suppression) ─────────
create table if not exists public.conversation_states (
  owner      uuid not null references public.players (id) on delete cascade,
  other      uuid not null references public.players (id) on delete cascade,
  archived   boolean not null default false,
  -- "Supprimer" = masquer pour soi les messages antérieurs à cet instant.
  -- Un nouveau message fait réapparaître la conversation. Rien n'est perdu pour l'autre.
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner, other)
);
alter table public.conversation_states enable row level security;
drop policy if exists "cs read"   on public.conversation_states;
drop policy if exists "cs insert" on public.conversation_states;
drop policy if exists "cs update" on public.conversation_states;
drop policy if exists "cs delete" on public.conversation_states;
create policy "cs read"   on public.conversation_states for select using (auth.uid() = owner);
create policy "cs insert" on public.conversation_states for insert with check (auth.uid() = owner);
create policy "cs update" on public.conversation_states for update using (auth.uid() = owner);
create policy "cs delete" on public.conversation_states for delete using (auth.uid() = owner);

-- ───────── Empêcher l'envoi de message à quelqu'un qu'on a bloqué (ou qui nous a bloqué) ─────────
-- On remplace la policy d'insertion des messages pour refuser sender↔recipient bloqués.
drop policy if exists "msg insert" on public.messages;
create policy "msg insert" on public.messages for insert with check (
  auth.uid() = sender
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker = sender and b.blocked = recipient)
       or (b.blocker = recipient and b.blocked = sender)
  )
);
