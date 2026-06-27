-- Ping Pang Paris — détail des manches (set scores) sur les matchs et les matchs de tournoi.
--
-- Format stocké : "11-7,9-11,11-8" (points de chaque manche), du point de vue de player_a
-- (le proposeur pour un défi, player_a du match pour un tournoi). L'affichage côté
-- player_b inverse chaque manche. La colonne `score` agrégée ("3-1" en sets) reste la source
-- de vérité pour le vainqueur ; `set_scores` est un détail optionnel.

alter table public.matches            add column if not exists set_scores text;
alter table public.tournament_matches add column if not exists set_scores text;

-- propose_match accepte désormais le détail des manches (rétrocompatible : défaut null).
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
  insert into notifications (player_id, type, title, body)
    values (p_opponent, 'match_confirm', 'Match à confirmer',
            coalesce(v_name, 'Un joueur') || ' a saisi un match (' || p_opp_sets || '-' || p_my_sets ||
            ' pour toi). Confirme ou conteste le score.');

  select glicko_rating, glicko_rd, glicko_vol into ar, ard, avol from players where id = v_me;
  select glicko_rating, glicko_rd into br, brd from players where id = p_opponent;
  select * into nx from _glicko_update(ar, ard, avol, br, brd, case when v_winner = v_me then 1 else 0 end);
  v_preview := round(nx.rating - ar);

  return jsonb_build_object('match_id', v_match, 'status', 'pending', 'won', v_winner = v_me, 'preview_delta', v_preview);
end; $$;
