-- Annulation d'un défi par son expéditeur : autorise le delete tant que le défi
-- est encore « sent » (en attente). Une fois accepté/refusé, plus d'annulation possible.
drop policy if exists "ch delete own" on public.challenges;
create policy "ch delete own" on public.challenges
  for delete using (auth.uid() = from_player and status = 'sent');
