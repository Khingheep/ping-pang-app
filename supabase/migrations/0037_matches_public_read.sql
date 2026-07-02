-- Ping Pang Paris — Feed global des matchs : tout le monde peut lire les matchs CONFIRMÉS
-- (comme le feed des séances). Les matchs pending/disputed restent privés aux 2 joueurs
-- via la policy existante "read own matches" (les policies permissives se cumulent en OR).

drop policy if exists "read confirmed matches" on public.matches;
create policy "read confirmed matches" on public.matches
  for select using (status = 'confirmed');
