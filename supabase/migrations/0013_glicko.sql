-- Ping Pang Paris — passage de l'ELO à Glicko-2 (Glickman 2013)
-- Glicko-2 suit, pour chaque joueur : rating + RD (incertitude) + volatilité.
-- 1 match = 1 "rating period" à un seul adversaire (variante online classique).
-- On garde la colonne `elo` synchronisée = round(glicko_rating) pour que tout l'UI existant marche.

alter table public.players
  add column if not exists glicko_rating double precision not null default 1500,
  add column if not exists glicko_rd     double precision not null default 350,
  add column if not exists glicko_vol    double precision not null default 0.06;

-- Nouveau joueur : on s'aligne sur la baseline du club (elo défaut = 1200), RD provisoire élevé.
alter table public.players alter column glicko_rating set default 1200;

-- Backfill : rating = ELO actuel ; RD calibré (les comptes existants sont "établis", pas provisoires).
update public.players set glicko_rating = coalesce(elo, 1200) where abs(glicko_rating - 1500) < 0.001;
update public.players set glicko_rd = 120 where glicko_rd >= 350;

-- Update Glicko-2 mono-jeu : retourne (rating, rd, vol) nouveaux pour le joueur.
-- s = 1 (victoire) / 0 (défaite) / 0.5 (nul). Solveur de volatilité = algo Illinois.
create or replace function public._glicko_update(
  r double precision, rd double precision, vol double precision,
  rj double precision, rdj double precision, s double precision
) returns table (rating double precision, rd_out double precision, vol_out double precision)
language plpgsql immutable as $$
declare
  scale double precision := 173.7178;
  tau   double precision := 0.5;
  eps   double precision := 1e-6;
  pi2   double precision := pi()*pi();
  mu   double precision := (r-1500)/scale;
  phi  double precision := rd/scale;
  muj  double precision := (rj-1500)/scale;
  phij double precision := rdj/scale;
  gj double precision; ej double precision; v double precision; dsum double precision; dlt double precision;
  a double precision; bigA double precision; bigB double precision; fA double precision; fB double precision;
  cC double precision; fC double precision; k int;
  newvol double precision; phistar double precision; newphi double precision; newmu double precision;
begin
  gj   := 1.0 / sqrt(1 + 3*phij*phij/pi2);
  ej   := 1.0 / (1 + exp(-gj*(mu-muj)));
  v    := 1.0 / (gj*gj*ej*(1-ej));
  dsum := gj*(s-ej);
  dlt  := v*dsum;

  a := ln(vol*vol);
  bigA := a;
  if dlt*dlt > phi*phi + v then
    bigB := ln(dlt*dlt - phi*phi - v);
  else
    k := 1;
    while ( (exp(a-k*tau)*(dlt*dlt - phi*phi - v - exp(a-k*tau)))
              / (2*power(phi*phi+v+exp(a-k*tau),2)) + k/tau ) < 0 loop
      k := k + 1;
    end loop;
    bigB := a - k*tau;
  end if;

  fA := (exp(bigA)*(dlt*dlt - phi*phi - v - exp(bigA)))/(2*power(phi*phi+v+exp(bigA),2)) - (bigA - a)/(tau*tau);
  fB := (exp(bigB)*(dlt*dlt - phi*phi - v - exp(bigB)))/(2*power(phi*phi+v+exp(bigB),2)) - (bigB - a)/(tau*tau);

  while abs(bigB - bigA) > eps loop
    cC := bigA + (bigA - bigB)*fA/(fB - fA);
    fC := (exp(cC)*(dlt*dlt - phi*phi - v - exp(cC)))/(2*power(phi*phi+v+exp(cC),2)) - (cC - a)/(tau*tau);
    if fC*fB <= 0 then bigA := bigB; fA := fB; else fA := fA/2; end if;
    bigB := cC; fB := fC;
  end loop;

  newvol  := exp(bigA/2);
  phistar := sqrt(phi*phi + newvol*newvol);
  newphi  := 1.0 / sqrt(1/(phistar*phistar) + 1/v);
  newmu   := mu + newphi*newphi*dsum;

  rating  := scale*newmu + 1500;
  rd_out  := scale*newphi;
  vol_out := newvol;
  return next;
end; $$;

-- Règle un match en Glicko-2 (les 2 joueurs), publie le feed. Remplace la version 0011.
create or replace function public._settle_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  ar double precision; ard double precision; avol double precision;
  br double precision; brd double precision; bvol double precision;
  na record; nb record;
  v_da int; v_db int;
  v_win_name text; v_lose_name text; v_loser uuid; v_win_score text; v_win_delta int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.status <> 'pending' then return; end if;
  if not (m.confirmed_by_a and m.confirmed_by_b) then return; end if;

  if m.is_ranked then
    select glicko_rating, glicko_rd, glicko_vol into ar, ard, avol from players where id = m.player_a;
    select glicko_rating, glicko_rd, glicko_vol into br, brd, bvol from players where id = m.player_b;

    -- s_a = 1 si player_a gagne, sinon 0 ; chaque calcul utilise les ratings AVANT match.
    select * into na from _glicko_update(ar, ard, avol, br, brd, case when m.winner = m.player_a then 1 else 0 end);
    select * into nb from _glicko_update(br, brd, bvol, ar, ard, case when m.winner = m.player_b then 1 else 0 end);

    v_da := round(na.rating - ar);
    v_db := round(nb.rating - br);

    update players set glicko_rating = na.rating, glicko_rd = na.rd_out, glicko_vol = na.vol_out,
                       elo = greatest(0, round(na.rating)) where id = m.player_a;
    update players set glicko_rating = nb.rating, glicko_rd = nb.rd_out, glicko_vol = nb.vol_out,
                       elo = greatest(0, round(nb.rating)) where id = m.player_b;
    update matches set elo_delta_a = v_da, elo_delta_b = v_db, status = 'confirmed' where id = p_match;
  else
    v_da := 0; v_db := 0;
    update matches set elo_delta_a = 0, elo_delta_b = 0, status = 'confirmed' where id = p_match;
  end if;

  -- Feed : "<gagnant> a battu <perdant> <score> (+delta)"
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

-- Recalcule le delta prévisionnel du proposeur en Glicko-2 (remplace l'estimation ELO de 0010).
create or replace function public.propose_match(
  p_opponent uuid, p_my_sets int, p_opp_sets int,
  p_best_of int default 5, p_is_ranked boolean default true, p_feeling text default null
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

  select glicko_rating, glicko_rd, glicko_vol into ar, ard, avol from players where id = v_me;
  select glicko_rating, glicko_rd into br, brd from players where id = p_opponent;
  select * into nx from _glicko_update(ar, ard, avol, br, brd, case when v_winner = v_me then 1 else 0 end);
  v_preview := round(nx.rating - ar);

  return jsonb_build_object('match_id', v_match, 'status', 'pending', 'won', v_winner = v_me, 'preview_delta', v_preview);
end; $$;
