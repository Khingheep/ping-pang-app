-- Ping Pang Paris — notifications cliquables : on ajoute une colonne `data` (jsonb)
-- qui porte l'id de l'entité cible (match_id / player_id / session_id / venue_id…),
-- pour que le tap sur une notif route vers le bon écran. Toutes les fonctions qui
-- insèrent une notification sont re-créées (CREATE OR REPLACE) à l'identique de leur
-- dernière version, avec la seule colonne `data` ajoutée. Les triggers existants
-- pointent déjà sur ces fonctions (même nom/signature) → pas besoin de les recréer.

alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;

-- ───────── challenge / message (cf. 0006) ─────────
create or replace function public.notify_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.from_player;
  insert into notifications (player_id, type, title, body, data)
    values (new.to_player, 'challenge', 'Nouveau défi',
            coalesce(v_name, 'Un joueur') || ' t''a défié !',
            jsonb_build_object('player_id', new.from_player));
  return new;
end; $$;

create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.sender;
  insert into notifications (player_id, type, title, body, data)
    values (new.recipient, 'message', 'Nouveau message',
            coalesce(v_name, 'Quelqu''un') || ' : ' || left(new.body, 40),
            jsonb_build_object('player_id', new.sender, 'name', v_name));
  return new;
end; $$;

-- ───────── match : propose / confirm / dispute (cf. 0022 + 0010) ─────────
-- propose_match : version 0022 (avec set_scores + delta Glicko), data = match_id.
create or replace function public.propose_match(
  p_opponent uuid, p_my_sets int, p_opp_sets int,
  p_best_of int default 5, p_is_ranked boolean default true, p_feeling text default null,
  p_set_scores text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_winner uuid; v_match uuid; v_name text;
  ar double precision; ard double precision; avol double precision;
  br double precision; brd double precision; nx record; v_preview int;
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

  select glicko_rating, glicko_rd, glicko_vol into ar, ard, avol from players where id = v_me;
  select glicko_rating, glicko_rd into br, brd from players where id = p_opponent;
  select * into nx from _glicko_update(ar, ard, avol, br, brd, case when v_winner = v_me then 1 else 0 end);
  v_preview := round(nx.rating - ar);

  return jsonb_build_object('match_id', v_match, 'status', 'pending', 'won', v_winner = v_me, 'preview_delta', v_preview);
end; $$;

-- confirm_match : version 0010, data = match_id.
create or replace function public.confirm_match(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches%rowtype; v_me uuid := auth.uid(); v_name text; v_delta int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'match not found'; end if;
  if v_me <> m.player_a and v_me <> m.player_b then raise exception 'not your match'; end if;
  if m.status <> 'pending' then raise exception 'match already %', m.status; end if;

  if v_me = m.player_a then update matches set confirmed_by_a = true where id = p_match;
  else update matches set confirmed_by_b = true where id = p_match; end if;

  perform _settle_match(p_match);
  select * into m from matches where id = p_match;

  if m.status = 'confirmed' then
    select display_name into v_name from players where id = m.player_b;
    insert into notifications (player_id, type, title, body, data)
      values (m.player_a, 'match_confirmed', 'Match confirmé ✅',
              coalesce(v_name, 'Ton adversaire') || ' a confirmé le match. ELO mis à jour.',
              jsonb_build_object('match_id', p_match));
  end if;
  v_delta := case when v_me = m.player_a then m.elo_delta_a else m.elo_delta_b end;
  return jsonb_build_object('match_id', p_match, 'status', m.status, 'won', m.winner = v_me, 'delta_me', coalesce(v_delta, 0));
end; $$;

-- dispute_match : version 0010, data = match_id.
create or replace function public.dispute_match(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches%rowtype; v_me uuid := auth.uid(); v_name text; v_other uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'match not found'; end if;
  if v_me <> m.player_a and v_me <> m.player_b then raise exception 'not your match'; end if;
  if m.status <> 'pending' then raise exception 'match already %', m.status; end if;

  update matches set status = 'disputed' where id = p_match;
  v_other := case when v_me = m.player_a then m.player_b else m.player_a end;
  select display_name into v_name from players where id = v_me;
  insert into notifications (player_id, type, title, body, data)
    values (v_other, 'match_disputed', 'Match contesté',
            coalesce(v_name, 'Ton adversaire') || ' a contesté le score. Reprenez contact pour le corriger.',
            jsonb_build_object('match_id', p_match));
  return jsonb_build_object('match_id', p_match, 'status', 'disputed');
end; $$;

-- propose_match est surchargée (version 6 params héritée de 0010/0013 + version 7 params 0022) :
-- on cible explicitement la signature à 7 args, sinon le grant est ambigu (SQLSTATE 42725).
grant execute on function public.propose_match(uuid, int, int, int, boolean, text, text) to authenticated;
grant execute on function public.confirm_match(uuid) to authenticated;
grant execute on function public.dispute_match(uuid) to authenticated;

-- ───────── amis (cf. 0014) ─────────
create or replace function public.notify_friend_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from players where id = new.requester;
  insert into notifications (player_id, type, title, body, data)
    values (new.addressee, 'friend_request', 'Demande d''ami',
            coalesce(v_name, 'Un joueur') || ' veut t''ajouter en ami.',
            jsonb_build_object('player_id', new.requester));
  return new;
end; $$;

create or replace function public.notify_friend_accept() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select display_name into v_name from players where id = new.addressee;
    insert into notifications (player_id, type, title, body, data)
      values (new.requester, 'friend_accepted', 'Demande acceptée 🎉',
              coalesce(v_name, 'Ton ami') || ' a accepté ta demande.',
              jsonb_build_object('player_id', new.addressee));
  end if;
  return new;
end; $$;

-- ───────── créneaux (cf. 0025 pour created, 0015 pour join) ─────────
create or replace function public.on_slot_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_venue text; v_when text;
begin
  insert into slot_participants (slot_id, player_id) values (new.id, new.host_id) on conflict do nothing;
  select display_name into v_name  from players where id = new.host_id;
  select name         into v_venue from venues  where id = new.venue_id;
  v_when := to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM à HH24hMI');

  -- Notif ciblée aux joueurs de la tranche de niveau, data = venue_id (+ slot_id).
  insert into notifications (player_id, type, title, body, data)
    select p.id, 'slot', 'Nouveau créneau',
           coalesce(v_name, 'Un joueur') || ' propose un créneau à ' || coalesce(v_venue, 'un lieu') || ' (' || v_when || ').',
           jsonb_build_object('venue_id', new.venue_id, 'slot_id', new.id)
    from players p
    where p.id <> new.host_id
      and (new.level_min is null or p.elo >= new.level_min)
      and (new.level_max is null or p.elo <= new.level_max);

  -- Feed public : invitation ouverte à rejoindre (inchangé).
  insert into feed_events (type, actor_id, actor_name, target_name, title, body)
    values ('slot', new.host_id, v_name, v_venue,
            coalesce(v_name, 'Un joueur') || ' propose un créneau à ' || coalesce(v_venue, 'un lieu') || ' 📅',
            v_when || ' · rejoins la partie !');
  return new;
end; $$;

create or replace function public.on_slot_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_host uuid; v_venue_id uuid; v_name text;
begin
  select host_id, venue_id into v_host, v_venue_id from slots where id = new.slot_id;
  if v_host is not null and v_host <> new.player_id then
    select display_name into v_name from players where id = new.player_id;
    insert into notifications (player_id, type, title, body, data)
      values (v_host, 'slot_join', 'Créneau rejoint',
              coalesce(v_name, 'Un joueur') || ' a rejoint ton créneau.',
              jsonb_build_object('venue_id', v_venue_id, 'slot_id', new.slot_id));
  end if;
  return new;
end; $$;

-- ───────── séances : like / comment (cf. 0028) ─────────
create or replace function public.notify_session_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_author uuid;
begin
  select player_id into v_author from training_sessions where id = new.session_id;
  if v_author is null or v_author = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body, data)
    values (v_author, 'session_comment', 'Nouveau commentaire',
            coalesce(v_name, 'Quelqu''un') || ' a commenté ta séance : ' || left(new.body, 40),
            jsonb_build_object('session_id', new.session_id));
  return new;
end; $$;

create or replace function public.notify_session_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_author uuid;
begin
  select player_id into v_author from training_sessions where id = new.session_id;
  if v_author is null or v_author = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body, data)
    values (v_author, 'session_like', 'Nouveau j''aime',
            coalesce(v_name, 'Quelqu''un') || ' a aimé ta séance',
            jsonb_build_object('session_id', new.session_id));
  return new;
end; $$;

-- ───────── matchs : like / comment (cf. 0036) ─────────
create or replace function public.notify_match_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_a uuid; v_b uuid; v_target uuid;
begin
  select player_a, player_b into v_a, v_b from matches where id = new.match_id;
  v_target := case when new.player_id = v_a then v_b else v_a end;
  if v_target is null or v_target = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body, data)
    values (v_target, 'match_comment', 'Nouveau commentaire',
            coalesce(v_name, 'Quelqu''un') || ' a commenté votre match : ' || left(new.body, 40),
            jsonb_build_object('match_id', new.match_id));
  return new;
end; $$;

create or replace function public.notify_match_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_a uuid; v_b uuid; v_target uuid;
begin
  select player_a, player_b into v_a, v_b from matches where id = new.match_id;
  v_target := case when new.player_id = v_a then v_b else v_a end;
  if v_target is null or v_target = new.player_id then
    return new;
  end if;
  select display_name into v_name from players where id = new.player_id;
  insert into notifications (player_id, type, title, body, data)
    values (v_target, 'match_like', 'Nouveau j''aime',
            coalesce(v_name, 'Quelqu''un') || ' a aimé votre match',
            jsonb_build_object('match_id', new.match_id));
  return new;
end; $$;
