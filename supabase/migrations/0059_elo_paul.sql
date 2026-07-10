-- Ping Pang Paris — bascule Glicko-2 → ELO « paramètres Paul » (06/07/2026).
--
--   ELO départ = points FFTT + 500, sinon 1000
--   P          = 1 / (1 + 10^((ELO adverse - ELO joueur) / 400))
--   ELO après  = ELO + K × Poids × (Résultat - P)
--   K          = 80 (0-5 matchs app joués) · 50 (6-10) · 30 (11+)
--   Poids      = 1 (match app) · 1.2 (match FFTT)
--
-- Simulations & analyse : scripts/test-elo-proposal.mjs + taches/elo-params-paul.md.
-- Les colonnes glicko_* et _glicko_update restent en place (gelées) pour pouvoir
-- rétropédaler ; seul `players.elo` vit désormais. Le trigger rating_history (0054)
-- écoute `elo` → l'historique continue de se remplir.

-- ───────────────────────── 1. Helpers ELO ─────────────────────────

-- Probabilité que `r` batte `opp`.
create or replace function public._elo_expected(r double precision, opp double precision)
returns double precision language sql immutable as $$
  select 1.0 / (1.0 + power(10, (opp - r) / 400.0));
$$;

-- K dégressif selon le nombre de matchs APP déjà joués (spec Paul : les matchs
-- FFTT ne font pas baisser le K — voir taches/elo-params-paul.md §D pour le débat).
create or replace function public._elo_k(app_matches int)
returns int language sql immutable as $$
  select case when app_matches <= 5 then 80 when app_matches <= 10 then 50 else 30 end;
$$;

-- Matchs app comptant pour le K : classés ET réglés (les amicaux/pending ne bougent pas l'ELO).
create or replace function public._app_match_count(p uuid)
returns int language sql stable as $$
  select count(*)::int from public.matches
  where (player_a = p or player_b = p) and status = 'confirmed' and is_ranked;
$$;

-- Niveau gamifié depuis l'ELO (mêmes paliers que src/lib/elo LEVELS).
create or replace function public._level_for_elo(e int)
returns text language sql immutable as $$
  select case
    when e >= 2100 then 'legend'  when e >= 1900 then 'elite'
    when e >= 1700 then 'master'  when e >= 1500 then 'expert'
    when e >= 1300 then 'confirme' when e >= 1100 then 'amateur'
    else 'rookie' end;
$$;

-- ───────────────────────── 2. ELO de départ + backfill ─────────────────────────

alter table public.players alter column elo set default 1000;

-- Date de liaison FFTT : borne de non-double-comptage (les matchs FFTT antérieurs
-- sont déjà « dans » le seed points+500, on n'applique que les suivants).
alter table public.players add column if not exists fftt_linked_at timestamptz;
update public.players set fftt_linked_at = now() where fftt_id is not null and fftt_linked_at is null;

create or replace function public._touch_fftt_linked() returns trigger
language plpgsql as $$
begin
  if new.fftt_id is distinct from old.fftt_id then
    new.fftt_linked_at := case when new.fftt_id is null then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists trg_touch_fftt_linked on public.players;
create trigger trg_touch_fftt_linked
  before update of fftt_id on public.players
  for each row execute function public._touch_fftt_linked();

-- RESET au départ Paul (app en phase de test — assumé, cf. taches/elo-params-paul.md) :
-- licencié → points FFTT + 500 ; sinon → 1000. Invités exclus (ELO décoratif).
-- Le trigger 0054 snapshotte chaque changement dans rating_history (reason 'auto').
update public.players p
set elo   = greatest(0, case when p.fftt_points is not null then p.fftt_points + 500 else 1000 end),
    level = public._level_for_elo(case when p.fftt_points is not null then p.fftt_points + 500 else 1000 end)
where coalesce(p.is_guest, false) = false;

-- Invités de tournoi : défaut aligné 1200 → 1000 (copie de 0056, seule la valeur change).
create or replace function public.create_tournament_guest(
  t_id uuid,
  guest_name text,
  guest_elo int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tournaments;
  new_id uuid := gen_random_uuid();
  n      int;
  clean  text := btrim(coalesce(guest_name, ''));
begin
  select * into t from public.tournaments where id = t_id;
  if t.id is null then
    raise exception 'tournoi introuvable';
  end if;
  if auth.uid() <> t.owner_id then
    raise exception 'non autorisé : réservé à l''organisateur';
  end if;
  if t.status <> 'open' then
    raise exception 'le tournoi a déjà commencé';
  end if;
  if clean = '' then
    raise exception 'nom d''invité vide';
  end if;

  select count(*) into n from public.tournament_players where tournament_id = t_id;
  if n >= t.max_players then
    raise exception 'le tournoi est complet';
  end if;

  insert into public.players (id, handle, display_name, elo, is_guest, created_by)
  values (
    new_id,
    'invite_' || replace(new_id::text, '-', ''),
    clean,
    greatest(0, coalesce(guest_elo, 1000)),
    true,
    auth.uid()
  );

  insert into public.tournament_players (tournament_id, player_id)
  values (t_id, new_id);

  return new_id;
end;
$$;

-- ───────────────────────── 3. _settle_match en ELO Paul ─────────────────────────
-- Structure identique à 0013 (confirmation double, feed) ; seul le calcul change.
-- K évalué sur les matchs DÉJÀ réglés (celui-ci est encore 'pending' → exclu du compte).

create or replace function public._settle_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_a_elo int; v_b_elo int;
  v_ka int; v_kb int;
  v_da int; v_db int;
  v_win_name text; v_lose_name text; v_loser uuid; v_win_score text; v_win_delta int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.status <> 'pending' then return; end if;
  if not (m.confirmed_by_a and m.confirmed_by_b) then return; end if;

  if m.is_ranked then
    select elo into v_a_elo from players where id = m.player_a;
    select elo into v_b_elo from players where id = m.player_b;

    v_ka := _elo_k(_app_match_count(m.player_a));
    v_kb := _elo_k(_app_match_count(m.player_b));

    -- Poids app = 1. Chaque delta utilise les ELO AVANT match ; non zéro-somme
    -- si les 2 joueurs ne sont pas au même palier K (voulu : les nouveaux calent vite).
    v_da := round(v_ka * ((case when m.winner = m.player_a then 1 else 0 end) - _elo_expected(v_a_elo, v_b_elo)));
    v_db := round(v_kb * ((case when m.winner = m.player_b then 1 else 0 end) - _elo_expected(v_b_elo, v_a_elo)));

    update players set elo = greatest(0, v_a_elo + v_da),
                       level = _level_for_elo(greatest(0, v_a_elo + v_da)) where id = m.player_a;
    update players set elo = greatest(0, v_b_elo + v_db),
                       level = _level_for_elo(greatest(0, v_b_elo + v_db)) where id = m.player_b;
    update matches set elo_delta_a = v_da, elo_delta_b = v_db, status = 'confirmed' where id = p_match;
  else
    v_da := 0; v_db := 0;
    update matches set elo_delta_a = 0, elo_delta_b = 0, status = 'confirmed' where id = p_match;
  end if;

  -- Feed : "<gagnant> a battu <perdant> <score> (+delta)" — identique à 0013.
  v_loser := case when m.winner = m.player_a then m.player_b else m.player_a end;
  select display_name into v_win_name  from players where id = m.winner;
  select display_name into v_lose_name from players where id = v_loser;
  if m.winner = m.player_a then
    v_win_score := m.score;
    v_win_delta := v_da;
  else
    v_win_score := split_part(m.score, '-', 2) || '-' || split_part(m.score, '-', 1);
    v_win_delta := v_db;
  end if;

  insert into feed_events (type, actor_id, actor_name, target_name, title, body, elo_delta)
  values ('match', m.winner, v_win_name, v_lose_name,
          coalesce(v_win_name, 'Un joueur') || ' a battu ' || coalesce(v_lose_name, 'un joueur'),
          v_win_score || ' · ' || case when m.is_ranked then 'Classé' else 'Amical' end,
          case when m.is_ranked then v_win_delta else null end);
end; $$;

-- ───────────────────────── 4. propose_match : preview en ELO Paul ─────────────────────────
-- Reprend la dernière version (0042 : 7 params + notifications `data`), seul le preview change.

create or replace function public.propose_match(
  p_opponent uuid, p_my_sets int, p_opp_sets int,
  p_best_of int default 5, p_is_ranked boolean default true, p_feeling text default null,
  p_set_scores text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_winner uuid; v_match uuid; v_name text;
  v_my_elo int; v_opp_elo int; v_preview int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_opponent = v_me then raise exception 'cannot play yourself'; end if;
  if p_my_sets = p_opp_sets then raise exception 'no winner (tie)'; end if;
  if not exists (select 1 from players where id = p_opponent) then raise exception 'opponent not found'; end if;

  v_winner := case when p_my_sets > p_opp_sets then v_me else p_opponent end;

  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       status, confirmed_by_a, confirmed_by_b, feeling)
  values (v_me, p_opponent, v_winner, p_my_sets || '-' || p_opp_sets, p_set_scores, p_best_of, p_is_ranked,
          'pending', true, false, p_feeling)
  returning id into v_match;

  select display_name into v_name from players where id = v_me;
  insert into notifications (player_id, type, title, body, data)
    values (p_opponent, 'match_confirm', 'Match à confirmer',
            coalesce(v_name, 'Un joueur') || ' a saisi un match (' || p_opp_sets || '-' || p_my_sets ||
            ' pour toi). Confirme ou conteste le score.',
            jsonb_build_object('match_id', v_match));

  select elo into v_my_elo  from players where id = v_me;
  select elo into v_opp_elo from players where id = p_opponent;
  v_preview := round(_elo_k(_app_match_count(v_me)) *
                     ((case when v_winner = v_me then 1 else 0 end) - _elo_expected(v_my_elo, v_opp_elo)));

  return jsonb_build_object('match_id', v_match, 'status', 'pending', 'won', v_winner = v_me, 'preview_delta', v_preview);
end; $$;

-- ───────────────────────── 5. Matchs FFTT → ELO app (poids 1.2) ─────────────────────────

alter table public.fftt_matches
  add column if not exists elo_applied     boolean not null default false,
  add column if not exists elo_delta       integer,
  add column if not exists elo_skip_reason text;

-- Baseline : tout l'historique déjà présent est réputé intégré au seed (points+500)
-- des comptes liés → jamais ré-appliqué.
update public.fftt_matches set elo_applied = true, elo_skip_reason = 'baseline'
where not elo_applied;

-- Applique à l'ELO app les matchs FFTT non traités d'un licencié lié (appelée par
-- l'edge function `fftt` après chaque upsert d'historique ; no-op pour un non-lié).
-- ELO adverse, par priorité : joueur app lié (ELO vivant) → miroir fftt_players
-- (points + 500) → classement legacy "12" (≈ 1250 pts → 1750) → sinon skip tracé.
create or replace function public.apply_fftt_matches(p_number_id text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_player players%rowtype;
  r record;
  v_elo int; v_opp_elo int; v_k int; v_delta int; v_applied int := 0;
begin
  select * into v_player from players
  where fftt_id = p_number_id and coalesce(is_guest, false) = false
  order by created_at limit 1;
  if v_player.id is null or v_player.fftt_linked_at is null then return 0; end if;

  v_elo := v_player.elo;
  v_k   := _elo_k(_app_match_count(v_player.id)); -- spec Paul : palier K = matchs APP uniquement

  for r in
    select * from fftt_matches
    where player_number_id = p_number_id and not elo_applied
    order by match_date asc nulls last, match_uid
  loop
    if r.match_date is null or r.victoire is null then
      update fftt_matches set elo_applied = true, elo_skip_reason = 'resultat_ou_date_inconnu'
      where match_uid = r.match_uid;
      continue;
    end if;
    if r.match_date < v_player.fftt_linked_at::date then
      update fftt_matches set elo_applied = true, elo_skip_reason = 'avant_liaison'
      where match_uid = r.match_uid;
      continue;
    end if;

    v_opp_elo := null;
    if r.adversaire_number_id is not null then
      select p2.elo into v_opp_elo from players p2
      where p2.fftt_id = r.adversaire_number_id and coalesce(p2.is_guest, false) = false
      order by p2.created_at limit 1;
      if v_opp_elo is null then
        select round(coalesce(fp.points_rt, fp.points_off, fp.points_men))::int + 500 into v_opp_elo
        from fftt_players fp
        where fp.number_id = r.adversaire_number_id
          and coalesce(fp.points_rt, fp.points_off, fp.points_men) is not null;
      end if;
    end if;
    if v_opp_elo is null and r.adversaire_classement ~ '^\d+$' then
      v_opp_elo := (r.adversaire_classement)::int * 100 + 550; -- milieu de bande + offset
    end if;
    if v_opp_elo is null then
      update fftt_matches set elo_applied = true, elo_skip_reason = 'adversaire_inconnu'
      where match_uid = r.match_uid;
      continue;
    end if;

    v_delta := round(v_k * 1.2 * ((case when r.victoire then 1 else 0 end) - _elo_expected(v_elo, v_opp_elo)));
    v_elo   := greatest(0, v_elo + v_delta);
    update fftt_matches set elo_applied = true, elo_delta = v_delta, elo_skip_reason = null
    where match_uid = r.match_uid;
    v_applied := v_applied + 1;
  end loop;

  if v_applied > 0 then
    update players set elo = v_elo, level = _level_for_elo(v_elo) where id = v_player.id;
  end if;
  return v_applied;
end; $$;

-- Appelée par l'edge function (service_role). Pas d'accès client direct.
revoke execute on function public.apply_fftt_matches(text) from public, anon, authenticated;
grant execute on function public.apply_fftt_matches(text) to service_role;
