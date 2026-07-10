-- Ping Pang Paris — modération des scores (retours Paul 07/07/2026).
--
--   1. Contester un score : 3 refus MAX par compte, ensuite bloqué (anti-mauvais perdant).
--   2. Score en attente : auto-accepté après 48 h sans réponse (cron horaire).
--   3. Signalement de compte pour fraude → tableau admin.
--   4. Comptes admin (players.is_admin) : consultent/traitent les signalements,
--      peuvent supprimer un compte. L'accès tournoi organisateur existe déjà (0057).

-- ───────────────────────── 1. Compteur de refus + admin ─────────────────────────

alter table public.players
  add column if not exists dispute_count int not null default 0,
  add column if not exists is_admin      boolean not null default false;

-- Le user courant est-il admin ? (RLS + fonctions ; players est lisible par tous)
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((select is_admin from public.players where id = auth.uid()), false);
$$;

-- dispute_match : version 0042 (notif `data`) + garde des 3 refus.
create or replace function public.dispute_match(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches%rowtype; v_me uuid := auth.uid(); v_name text; v_other uuid; v_count int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'match not found'; end if;
  if v_me <> m.player_a and v_me <> m.player_b then raise exception 'not your match'; end if;
  if m.status <> 'pending' then raise exception 'match already %', m.status; end if;

  select dispute_count into v_count from players where id = v_me;
  if v_count >= 3 then
    raise exception 'Limite de contestations atteinte (3). Confirme le score ou signale le compte depuis son profil.';
  end if;
  update players set dispute_count = dispute_count + 1 where id = v_me;

  update matches set status = 'disputed' where id = p_match;
  v_other := case when v_me = m.player_a then m.player_b else m.player_a end;
  select display_name into v_name from players where id = v_me;
  insert into notifications (player_id, type, title, body, data)
    values (v_other, 'match_disputed', 'Match contesté',
            coalesce(v_name, 'Ton adversaire') || ' a contesté le score. Reprenez contact pour le corriger.',
            jsonb_build_object('match_id', p_match));
  return jsonb_build_object('match_id', p_match, 'status', 'disputed',
                            'disputes_left', greatest(0, 3 - v_count - 1));
end; $$;

grant execute on function public.dispute_match(uuid) to authenticated;

-- ───────────────────────── 2. Auto-acceptation après 48 h ─────────────────────────
-- Un score proposé non confirmé/contesté sous 48 h est réputé accepté : on coche les
-- deux confirmations puis on laisse _settle_match régler ELO + feed, et on notifie.

create or replace function public.auto_confirm_stale_matches() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    select id, player_a, player_b from matches
    where status = 'pending' and created_at < now() - interval '48 hours'
  loop
    update matches set confirmed_by_a = true, confirmed_by_b = true where id = r.id;
    perform _settle_match(r.id);
    insert into notifications (player_id, type, title, body, data)
    values
      (r.player_a, 'match_confirmed', 'Match validé automatiquement',
       'Sans réponse sous 48 h, le score a été accepté automatiquement. ELO mis à jour.',
       jsonb_build_object('match_id', r.id)),
      (r.player_b, 'match_confirmed', 'Match validé automatiquement',
       'Sans réponse sous 48 h, le score a été accepté automatiquement. ELO mis à jour.',
       jsonb_build_object('match_id', r.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- Cron horaire (pg_cron déjà activé par 0008).
select cron.unschedule('auto-confirm-matches-hourly')
where exists (select 1 from cron.job where jobname = 'auto-confirm-matches-hourly');
select cron.schedule(
  'auto-confirm-matches-hourly',
  '15 * * * *',
  $$select public.auto_confirm_stale_matches()$$
);

-- ───────────────────────── 3. Signalements de comptes ─────────────────────────

create table if not exists public.player_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.players (id) on delete cascade,
  reported    uuid not null references public.players (id) on delete cascade,
  match_id    uuid references public.matches (id) on delete set null,
  reason      text not null,
  status      text not null default 'open',   -- open | resolved | dismissed
  created_at  timestamptz not null default now(),
  resolved_by uuid references public.players (id) on delete set null,
  resolved_at timestamptz
);

-- Anti-spam : un seul signalement OUVERT par paire (reporter → reported).
create unique index if not exists uq_player_reports_open
  on public.player_reports (reporter, reported) where status = 'open';
create index if not exists idx_player_reports_status on public.player_reports (status, created_at desc);

alter table public.player_reports enable row level security;
drop policy if exists "reports insert own" on public.player_reports;
create policy "reports insert own" on public.player_reports
  for insert with check (auth.uid() = reporter and reporter <> reported);
drop policy if exists "reports read admin or own" on public.player_reports;
create policy "reports read admin or own" on public.player_reports
  for select using (public.is_admin() or reporter = auth.uid());
-- Résolution uniquement via la fonction admin ci-dessous (pas d'update direct client).

-- ───────────────────────── 4. Actions admin ─────────────────────────

-- Clôture d'un signalement : p_action = 'resolved' (traité) | 'dismissed' (ignoré).
create or replace function public.admin_resolve_report(p_report uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé aux admins'; end if;
  if p_action not in ('resolved', 'dismissed') then raise exception 'action invalide: %', p_action; end if;
  update player_reports
  set status = p_action, resolved_by = auth.uid(), resolved_at = now()
  where id = p_report and status = 'open';
end; $$;

-- Remise à zéro du compteur de refus d'un joueur (grâce admin).
create or replace function public.admin_reset_disputes(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé aux admins'; end if;
  update players set dispute_count = 0 where id = p_target;
end; $$;

-- Suppression d'un compte (cas extrême, cf. Paul). Supprime la ligne players
-- (FK en cascade, cf. 0027) puis le user auth (login) — best-effort si absent (invité).
create or replace function public.admin_delete_player(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé aux admins'; end if;
  if p_target = auth.uid() then raise exception 'impossible de supprimer son propre compte'; end if;
  if coalesce((select is_admin from players where id = p_target), false) then
    raise exception 'impossible de supprimer un compte admin';
  end if;
  delete from players where id = p_target;
  begin
    delete from auth.users where id = p_target;
  exception when others then
    null; -- invité sans compte auth, ou droits restreints : la ligne players a bien été supprimée
  end;
end; $$;

grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.admin_reset_disputes(uuid)       to authenticated;
grant execute on function public.admin_delete_player(uuid)        to authenticated;

-- Comptes admin initiaux (équipe). À refaire après un clean de la base :
--   update players set is_admin = true where handle in ('walid', 'paul');
update public.players set is_admin = true where handle in ('walid', 'paul');
