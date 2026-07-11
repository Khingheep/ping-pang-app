-- Ping Pang Paris — Résolution propre d'une contestation : RE-PROPOSER le bon score.
--
-- Au lieu de créer un NOUVEAU match (qui laisse la carte contestée fantôme), on RÉUTILISE
-- l'enregistrement contesté : on le remet en 'pending' avec le score corrigé, confirmé du côté
-- de celui qui re-propose, en attente de l'autre. Le format (best_of / is_ranked) est conservé.
--
-- Le score est stocké du point de vue de player_a (convention propose_match) → on flippe si
-- c'est player_b qui re-propose (agrégat + détail des manches). La fenêtre d'auto-acceptation
-- 48h (0060) est relancée via created_at = now().

create or replace function public.repropose_match(
  p_match uuid, p_my_sets int, p_opp_sets int, p_set_scores text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype; v_me uuid := auth.uid(); v_other uuid; v_name text;
  v_i_am_a boolean; v_score text; v_setscores text; v_winner uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_my_sets = p_opp_sets then raise exception 'no winner (tie)'; end if;

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'match not found'; end if;
  if v_me <> m.player_a and v_me <> m.player_b then raise exception 'not your match'; end if;
  if m.status <> 'disputed' then
    raise exception 'match is % (seul un match contesté peut être re-proposé)', m.status;
  end if;

  v_i_am_a := (v_me = m.player_a);
  v_other  := case when v_i_am_a then m.player_b else m.player_a end;

  -- Stockage côté player_a : si je suis player_b, on inverse l'agrégat ET chaque manche.
  if v_i_am_a then
    v_score     := p_my_sets || '-' || p_opp_sets;
    v_setscores := p_set_scores;
  else
    v_score := p_opp_sets || '-' || p_my_sets;
    if p_set_scores is null or p_set_scores = '' then
      v_setscores := p_set_scores;
    else
      select string_agg(split_part(s, '-', 2) || '-' || split_part(s, '-', 1), ',' order by ord)
        into v_setscores
        from unnest(string_to_array(p_set_scores, ',')) with ordinality as t(s, ord);
    end if;
  end if;
  v_winner := case when p_my_sets > p_opp_sets then v_me else v_other end;

  update matches set
    status         = 'pending',
    score          = v_score,
    set_scores     = v_setscores,
    winner         = v_winner,
    confirmed_by_a = v_i_am_a,
    confirmed_by_b = not v_i_am_a,
    elo_delta_a    = null,
    elo_delta_b    = null,
    created_at     = now()   -- relance la fenêtre de confirmation / auto-accept 48h
  where id = p_match;

  select display_name into v_name from players where id = v_me;
  insert into notifications (player_id, type, title, body, data)
    values (v_other, 'match_confirm', 'Score corrigé à confirmer',
            coalesce(v_name, 'Ton adversaire') || ' a re-proposé le bon score. Confirme ou conteste.',
            jsonb_build_object('match_id', p_match));

  return jsonb_build_object('match_id', p_match, 'status', 'pending');
end; $$;

grant execute on function public.repropose_match to authenticated;
