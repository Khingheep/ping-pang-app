-- Ping Pang Paris — Durcissement de la saisie des scores de tournoi (complète 0044).
--
-- 0044 restreint DÉJÀ QUI peut modifier un match : l'un des deux joueurs (son match) ou
-- l'organisateur (tous). Ici on ajoute un garde-fou sur le CONTENU de l'écriture (WITH CHECK) :
-- le vainqueur enregistré doit être l'un des deux joueurs du match — ou nul tant qu'il n'est pas
-- joué. Ça bloque au niveau base l'inscription d'un vainqueur aberrant (joueur hors du match),
-- même via un appel API direct qui contournerait l'UI.
--
-- NB : on ne fige pas player_a/player_b/tournament_id ici (RLS n'a pas accès à l'ancienne ligne) ;
-- la génération des tours reste un INSERT (policy séparée, inchangée). L'organisateur peut toujours
-- corriger/annuler un score (winner = null repasse le check).

drop policy if exists "tmatches score owner or players" on public.tournament_matches;
create policy "tmatches score owner or players" on public.tournament_matches
  for update using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or auth.uid() = (select owner_id from public.tournaments t where t.id = tournament_matches.tournament_id)
  )
  with check (
    winner is null
    or winner = player_a
    or winner = player_b
  );
