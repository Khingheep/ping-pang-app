-- Seed de matchs DÉMO avec détail des manches + likes + commentaires, pour voir le scoreboard
-- sur les comptes perso (walid / walidtest / test1). Idempotent : on re-supprime d'abord les
-- lignes marquées feeling='seed-demo' (n'affecte jamais les vrais matchs).

delete from match_comments where match_id in (select id from matches where feeling = 'seed-demo');
delete from match_likes    where match_id in (select id from matches where feeling = 'seed-demo');
delete from matches where feeling = 'seed-demo';

do $$
declare
  walid uuid := '608782a4-9f5e-4d75-8c17-e27c11ae654c';
  wtest uuid := '635fbd49-cf54-4f02-916a-907851dfa482';
  test1 uuid := 'b5fdcba1-74d0-458b-a0d4-1026bcac8145';
  wei uuid := 'b47db095-47c7-4154-9978-032e65fb51af';
  lucas uuid := '7722238f-a2e8-4a24-ae11-1eda0bda399e';
  ana uuid := '1447204e-a710-4009-af74-15bf0ad97108';
  emma uuid := '1ce59ffc-db40-493d-a01f-8dddb6632d42';
  yuki uuid := '65b8360d-6aac-47ad-83ab-b1fff9ac349e';
  maxime uuid := '355730d9-16fe-4796-a3fe-8f6059e7e16a';
  thomas uuid := '0ce4de08-43f8-4127-b1c6-250d3b2fc1a9';
  m1 uuid; m3 uuid;
begin
  -- ───── WALID ─────
  -- M1 : walid(a) bat wei 3-2
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (walid, wei, walid, '3-2', '11-9,8-11,11-6,9-11,11-7', 5, true, 22, -22,
          'seed-demo', 'confirmed', true, true, now() - interval '1 day')
  returning id into m1;

  -- M2 : walid(a) perd contre lucas 1-3
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (walid, lucas, lucas, '1-3', '11-8,9-11,7-11,9-11', 5, true, -15, 15,
          'seed-demo', 'confirmed', true, true, now() - interval '3 days');

  -- M3 : ana(a) vs walid(b) -> walid gagne 3-1 (teste l'inversion de vue)
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (ana, walid, walid, '1-3', '9-11,11-7,8-11,6-11', 5, true, -12, 12,
          'seed-demo', 'confirmed', true, true, now() - interval '5 days')
  returning id into m3;

  -- M4 : walid(a) bat maxime 3-0
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (walid, maxime, walid, '3-0', '11-7,11-9,11-5', 5, true, 10, -10,
          'seed-demo', 'confirmed', true, true, now() - interval '7 days');

  -- M5 : yuki(a) vs walid(b) -> walid perd 2-3
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (yuki, walid, yuki, '3-2', '11-9,9-11,11-8,7-11,11-9', 5, true, 14, -14,
          'seed-demo', 'confirmed', true, true, now() - interval '10 days');

  -- M6 : walid(a) bat emma 3-1 en AMICAL (pas d'ELO)
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (walid, emma, walid, '3-1', '11-6,11-13,11-8,11-9', 5, false, null, null,
          'seed-demo', 'confirmed', true, true, now() - interval '12 days');

  -- ───── WALID TEST ─────
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (wtest, thomas, wtest, '3-1', '11-8,9-11,11-6,11-7', 5, true, 18, -18,
          'seed-demo', 'confirmed', true, true, now() - interval '2 days');
  insert into matches (player_a, player_b, winner, score, set_scores, best_of, is_ranked,
                       elo_delta_a, elo_delta_b, feeling, status, confirmed_by_a, confirmed_by_b, played_at)
  values (lucas, wtest, lucas, '3-0', '11-7,11-8,11-9', 5, true, 9, -9,
          'seed-demo', 'confirmed', true, true, now() - interval '4 days');

  -- ───── TEST1 (Walid Bouzidane) : volontairement SANS matchs classés en dur ─────
  -- On n'insère plus de matchs is_ranked=true avec des elo_delta écrits à la main sur les
  -- comptes perso : ça décorrèle le rating réel (jamais mis à jour) du widget « 7 jours »
  -- (qui somme ces deltas). Pour un match de démo qui bouge vraiment l'ELO, utiliser le vrai
  -- flux propose_match -> confirm_match (cf. scripts/seed-matches.mjs).

  -- ───── Likes + commentaires (sur les matchs de walid, par l'adversaire) ─────
  insert into match_likes (match_id, player_id) values (m1, wei);
  insert into match_likes (match_id, player_id) values (m3, ana);

  insert into match_comments (match_id, player_id, body) values
    (m1, wei,   'Belle remontée dans le 5e set, GG !'),
    (m1, walid, 'Serré jusqu''au bout, revanche quand tu veux 😄'),
    (m3, ana,   'Trop fort, j''ai rien pu faire en fin de match.');
end $$;

select count(*)::int as seeded_matches from matches where feeling = 'seed-demo';
