-- Ping Pang Paris — enregistrement de match + ELO atomique (Mission 01)
-- La maj de l'ELO des 2 joueurs ne peut pas se faire côté client (RLS limite
-- l'update au profil de l'appelant). On passe par une fonction SECURITY DEFINER.

-- Lecture de ses propres matchs
drop policy if exists "read own matches" on public.matches;
create policy "read own matches" on public.matches
  for select using (auth.uid() = player_a or auth.uid() = player_b);

create or replace function public.record_match(
  p_opponent  uuid,
  p_my_sets   int,
  p_opp_sets  int,
  p_best_of   int default 5,
  p_is_ranked boolean default true,
  p_feeling   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_a_elo   int;
  v_b_elo   int;
  v_winner  uuid;
  v_exp_a   numeric;
  v_delta_a int;
  v_delta_b int;
  v_k       int := 32;
  v_match   uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_opponent = v_me then raise exception 'cannot play yourself'; end if;
  if p_my_sets = p_opp_sets then raise exception 'no winner (tie)'; end if;

  select elo into v_a_elo from players where id = v_me;
  select elo into v_b_elo from players where id = p_opponent;
  if v_a_elo is null or v_b_elo is null then raise exception 'player not found'; end if;

  v_winner := case when p_my_sets > p_opp_sets then v_me else p_opponent end;
  -- ELO zéro-somme : delta_b = -delta_a
  v_exp_a   := 1.0 / (1.0 + power(10, (v_b_elo - v_a_elo) / 400.0));
  v_delta_a := round(v_k * ((case when v_winner = v_me then 1 else 0 end) - v_exp_a));
  v_delta_b := -v_delta_a;

  insert into matches (
    player_a, player_b, winner, score, best_of, is_ranked,
    elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b
  ) values (
    v_me, p_opponent, v_winner, p_my_sets || '-' || p_opp_sets, p_best_of, p_is_ranked,
    v_delta_a, v_delta_b, p_feeling, 'confirmed', true, true
  ) returning id into v_match;

  if p_is_ranked then
    update players set elo = greatest(0, elo + v_delta_a) where id = v_me;
    update players set elo = greatest(0, elo + v_delta_b) where id = p_opponent;
  end if;

  return jsonb_build_object(
    'match_id', v_match,
    'delta_me', v_delta_a,
    'delta_opp', v_delta_b,
    'won', v_winner = v_me
  );
end;
$$;

grant execute on function public.record_match to authenticated;
