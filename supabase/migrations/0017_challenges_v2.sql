-- Ping Pang Paris — Défis v2 : format + délai d'acceptation 48h + aperçu ELO en jeu (Glicko).

alter table public.challenges
  add column if not exists format     text default 'wtt',   -- wtt | bo5 | bo3
  add column if not exists expires_at timestamptz;
update public.challenges set expires_at = created_at + interval '48 hours' where expires_at is null;

-- Aperçu de l'ELO en jeu pour un défi : ce que je gagnerais (victoire) / perdrais (défaite)
-- contre p_opponent, calculé en Glicko-2 à partir des ratings actuels.
create or replace function public.glicko_preview(p_opponent uuid)
returns table (win_delta int, loss_delta int)
language plpgsql security definer set search_path = public as $$
declare
  ar double precision; ard double precision; avol double precision;
  br double precision; brd double precision; w record; l record;
begin
  select glicko_rating, glicko_rd, glicko_vol into ar, ard, avol from players where id = auth.uid();
  select glicko_rating, glicko_rd into br, brd from players where id = p_opponent;
  if ar is null or br is null then
    win_delta := 0; loss_delta := 0; return next; return;
  end if;
  select * into w from _glicko_update(ar, ard, avol, br, brd, 1);
  select * into l from _glicko_update(ar, ard, avol, br, brd, 0);
  win_delta := round(w.rating - ar);
  loss_delta := round(l.rating - ar);
  return next;
end; $$;
grant execute on function public.glicko_preview to authenticated;
