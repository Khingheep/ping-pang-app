-- Ping Pang Paris — classement + variation d'ELO par joueur sur N jours, en UNE requête.
-- L'écran Ranking affiche, à droite de chaque ligne, un indicateur de tendance : +N (vert) si
-- le joueur a gagné des points d'ELO sur la période, -N (rouge) s'il en a perdu, rien si 0.
-- On réutilise `rating_history` (snapshot à chaque variation d'ELO — cf. 0054) : le delta d'un
-- joueur = elo actuel − son ELO au dernier snapshot antérieur à (now − p_days), sinon son plus
-- ancien snapshot connu (baseline). Fiable, contrairement à une somme d'elo_delta de matchs.

create or replace function public.leaderboard_ranked(p_limit int default 200, p_days int default 7)
returns table (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text,
  city         text,
  country      text,
  elo          integer,
  level        text,
  lat          double precision,
  lng          double precision,
  delta        integer
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.handle::text,
    p.display_name::text,
    p.avatar_url::text,
    p.city::text,
    p.country::text,
    p.elo::int,
    p.level::text,
    p.lat::double precision,
    p.lng::double precision,
    (p.elo - coalesce(
      -- dernier ELO connu AVANT (now − p_days)
      (select rh.elo
         from public.rating_history rh
        where rh.player_id = p.id
          and rh.recorded_at <= now() - make_interval(days => p_days)
        order by rh.recorded_at desc
        limit 1),
      -- à défaut : le tout premier snapshot (baseline) → delta 0 si rien n'a bougé
      (select rh.elo
         from public.rating_history rh
        where rh.player_id = p.id
        order by rh.recorded_at asc
        limit 1),
      p.elo
    ))::int as delta
  from public.players p
  where p.is_guest = false           -- les invités de tournoi (sans compte) ne comptent pas
  order by p.elo desc
  limit p_limit;
$$;

grant execute on function public.leaderboard_ranked(int, int) to authenticated, anon;
