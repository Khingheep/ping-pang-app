-- Ping Pang Paris — confirmation de match par les 2 joueurs (anti-triche, différenciateur FFTT)
-- Un match est d'abord 'pending' (proposé par player_a). L'ELO n'est appliqué qu'une fois
-- confirmé par l'adversaire (player_b). Les deltas sont (re)calculés au moment du règlement,
-- en zéro-somme, à partir des ELO courants. Tout passe par des fonctions SECURITY DEFINER.

-- Règle un match : calcule + applique l'ELO une fois les 2 confirmations obtenues.
create or replace function public._settle_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m       matches%rowtype;
  v_a_elo int; v_b_elo int; v_exp_a numeric; v_delta_a int; v_k int := 32;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.status <> 'pending' then return; end if;
  if not (m.confirmed_by_a and m.confirmed_by_b) then return; end if;

  if m.is_ranked then
    select elo into v_a_elo from players where id = m.player_a;
    select elo into v_b_elo from players where id = m.player_b;
    v_exp_a   := 1.0 / (1.0 + power(10, (v_b_elo - v_a_elo) / 400.0));
    v_delta_a := round(v_k * ((case when m.winner = m.player_a then 1 else 0 end) - v_exp_a));
    update players set elo = greatest(0, elo + v_delta_a) where id = m.player_a;
    update players set elo = greatest(0, elo - v_delta_a) where id = m.player_b;
    update matches set elo_delta_a = v_delta_a, elo_delta_b = -v_delta_a, status = 'confirmed' where id = p_match;
  else
    update matches set elo_delta_a = 0, elo_delta_b = 0, status = 'confirmed' where id = p_match;
  end if;
end; $$;

-- Proposer un match (le proposeur devient player_a, déjà confirmé de son côté).
create or replace function public.propose_match(
  p_opponent uuid, p_my_sets int, p_opp_sets int,
  p_best_of int default 5, p_is_ranked boolean default true, p_feeling text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_winner uuid; v_match uuid; v_name text;
  v_a_elo int; v_b_elo int; v_exp_a numeric; v_preview int;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_opponent = v_me then raise exception 'cannot play yourself'; end if;
  if p_my_sets = p_opp_sets then raise exception 'no winner (tie)'; end if;
  if not exists (select 1 from players where id = p_opponent) then raise exception 'opponent not found'; end if;

  v_winner := case when p_my_sets > p_opp_sets then v_me else p_opponent end;

  insert into matches (player_a, player_b, winner, score, best_of, is_ranked,
                       status, confirmed_by_a, confirmed_by_b, feeling)
  values (v_me, p_opponent, v_winner, p_my_sets || '-' || p_opp_sets, p_best_of, p_is_ranked,
          'pending', true, false, p_feeling)
  returning id into v_match;

  select display_name into v_name from players where id = v_me;
  insert into notifications (player_id, type, title, body)
    values (p_opponent, 'match_confirm', 'Match à confirmer',
            coalesce(v_name, 'Un joueur') || ' a saisi un match (' || p_opp_sets || '-' || p_my_sets ||
            ' pour toi). Confirme ou conteste le score.');

  -- delta prévisionnel affiché au proposeur (recalculé au règlement)
  select elo into v_a_elo from players where id = v_me;
  select elo into v_b_elo from players where id = p_opponent;
  v_exp_a   := 1.0 / (1.0 + power(10, (v_b_elo - v_a_elo) / 400.0));
  v_preview := round(32 * ((case when v_winner = v_me then 1 else 0 end) - v_exp_a));

  return jsonb_build_object('match_id', v_match, 'status', 'pending', 'won', v_winner = v_me, 'preview_delta', v_preview);
end; $$;

-- Confirmer un match en attente ; règle l'ELO si les 2 ont confirmé.
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
    insert into notifications (player_id, type, title, body)
      values (m.player_a, 'match_confirmed', 'Match confirmé ✅',
              coalesce(v_name, 'Ton adversaire') || ' a confirmé le match. ELO mis à jour.');
  end if;
  v_delta := case when v_me = m.player_a then m.elo_delta_a else m.elo_delta_b end;
  return jsonb_build_object('match_id', p_match, 'status', m.status, 'won', m.winner = v_me, 'delta_me', coalesce(v_delta, 0));
end; $$;

-- Contester le score d'un match en attente.
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
  insert into notifications (player_id, type, title, body)
    values (v_other, 'match_disputed', 'Match contesté',
            coalesce(v_name, 'Ton adversaire') || ' a contesté le score. Reprenez contact pour le corriger.');
  return jsonb_build_object('match_id', p_match, 'status', 'disputed');
end; $$;

grant execute on function public.propose_match to authenticated;
grant execute on function public.confirm_match to authenticated;
grant execute on function public.dispute_match to authenticated;
