-- Migration 035 — Banque d'exercices vidéo UNIFIÉE.
--
-- Objectif : une seule table d'exercices (daily_drills), une seule page catalogue,
-- toutes les vidéos au même endroit. On :
--   1) ajoute `lieu` (où peut-on faire l'exo), `video_provider`, `pro_id`,
--      `thumbnail_url`, `difficulty` ;
--   2) back-fill `lieu` à partir des colonnes existantes (requires_*) ;
--   3) câble de vraies vidéos YouTube (PingSkills) sur les exos clés —
--      priorité aux SERVICES (cf. demande user), puis top-spin / poussette / coup droit ;
--   4) FUSIONNE les 12 `pro_exercises` (placeholders) dans daily_drills avec `pro_id`
--      → la table pro_exercises devient legacy (plus consommée par le catalogue).
--
-- `lieu` ∈ { maison | mur | table_solo | table_duo | table_robot }
-- `video_provider` ∈ { youtube | r2 | NULL }  (NULL = video_url pointe un article externe)
--
-- ⚠ Migration manuelle (cf docs/BACKEND.md §2). Régénérer schema.sql après application.

-- =============================================================================
-- 1. Colonnes
-- =============================================================================
ALTER TABLE daily_drills ADD COLUMN lieu           TEXT;
ALTER TABLE daily_drills ADD COLUMN video_provider TEXT;
ALTER TABLE daily_drills ADD COLUMN pro_id         TEXT;
ALTER TABLE daily_drills ADD COLUMN thumbnail_url  TEXT;
ALTER TABLE daily_drills ADD COLUMN difficulty     TEXT;

CREATE INDEX IF NOT EXISTS idx_drills_lieu ON daily_drills(lieu, active);

-- =============================================================================
-- 2. Back-fill `lieu` (déduit du matériel requis + catégorie)
-- =============================================================================
UPDATE daily_drills SET lieu='mur'         WHERE requires_wall=1    AND lieu IS NULL;
UPDATE daily_drills SET lieu='table_robot' WHERE requires_robot=1   AND lieu IS NULL;
UPDATE daily_drills SET lieu='table_duo'   WHERE requires_partner=1 AND lieu IS NULL;
UPDATE daily_drills SET lieu='maison'      WHERE category IN ('juggling','fitness','mental') AND lieu IS NULL;
UPDATE daily_drills SET lieu='maison'
  WHERE category IN ('footwork','skill')
    AND requires_partner=0 AND requires_robot=0 AND requires_wall=0
    AND lieu IS NULL;
UPDATE daily_drills SET lieu='table_solo'  WHERE lieu IS NULL;   -- services / panier solo

-- =============================================================================
-- 3. Vidéos YouTube curées (PingSkills) sur les exos existants
-- =============================================================================
-- --- SERVICES (priorité) -----------------------------------------------------
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=NfmPcpi4sfc', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_service_regl_cd';
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=_LhmBGTRlCE', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_service_regl_revers';
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=h2YDRVhz08I', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_service_court_sans_effet';
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=4lQP33tJJfg', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_service_long_rapide';
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=eMUPrs3vvpI', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_service_relance_signature';
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=-03N_1zOM4E', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_retour_service_place';

-- --- TOP-SPIN ----------------------------------------------------------------
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=NWw_1SO3TV0', video_provider='youtube', video_source='PingSkills'
  WHERE id IN ('drill_topspin_cd_coupe','drill_topspin_revers_coupe');
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=BpVAPPzj3ZI', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_topspin_sur_bloc';

-- --- COUP DROIT / RÉGULARITÉ -------------------------------------------------
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=GxAqmTLZLh0', video_provider='youtube', video_source='PingSkills'
  WHERE id IN ('drill_renvoi_cd_demi','drill_cd_50_echanges');

-- --- POUSSETTE ---------------------------------------------------------------
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=Hx5ZQSsmFjo', video_provider='youtube', video_source='PingSkills'
  WHERE id IN ('drill_poussette_cd','drill_poussette_revers','drill_poussette_courte_longue');

-- =============================================================================
-- 4. Fusion des 12 pro_exercises dans daily_drills (pro_id = signature du pro)
-- =============================================================================
-- Mapping skill_targeted -> category ; tier dérivé de l'étape FFTT (cf mig 028).
-- Vidéo YouTube attachée seulement quand un tuto enseigne réellement la technique.
INSERT OR IGNORE INTO daily_drills
  (id, name, description, category, fftt_stage, tier_min, tier_max, targets_axis,
   duration_min, goal_count, goal_metric, requires_partner, requires_robot, requires_wall,
   active, lieu, difficulty, pro_id, video_url, video_provider, video_source, thumbnail_url, tags, source)
VALUES
 ('ex_lebrun_felix_serve','Service court latéral signature (Félix Lebrun)',
  'Le service court latéral coupé qui ouvre l''angle pour la 3e balle. Coup signature de Félix.',
  'service','jeuping',4,6,NULL,8,NULL,NULL,0,0,0,1,'table_solo','medium','pro_lebrun_felix',
  'https://www.youtube.com/watch?v=hg_wC5-HT-0','youtube','PingSkills',NULL,'service,lateral,pendulum,pro','Bibliothèque pros'),

 ('ex_lebrun_alexis_block','Bloc actif revers anti-topspin (Alexis Lebrun)',
  'Bloc actif revers contre top-spin lourd. Position de raquette + timing.',
  'block','techniping',6,8,'timing',6,NULL,NULL,1,0,0,1,'table_duo','medium','pro_lebrun_alexis',
  NULL,NULL,NULL,NULL,'bloc,revers,pro','Bibliothèque pros'),

 ('ex_ma_long_topspin_cd','Top-spin coup droit classique (Ma Long)',
  'Le top-spin coup droit signature de Ma Long. Engagement hanche -> épaule -> bras.',
  'topspin','techniping',6,8,'sequence',10,NULL,NULL,1,0,0,1,'table_duo','hard','pro_ma_long',
  'https://www.youtube.com/watch?v=XFRqT3miJ3I','youtube','PingSkills',NULL,'topspin,coup_droit,pro','Bibliothèque pros'),

 ('ex_fan_zhendong_revers','Revers puissance shakehand (Fan Zhendong)',
  'Le revers le plus dévastateur du circuit. Préparation + contact + accélération.',
  'topspin','excelping',7,9,'sequence',12,NULL,NULL,1,0,0,1,'table_duo','hard','pro_fan_zhendong',
  'https://www.youtube.com/watch?v=XFRqT3miJ3I','youtube','PingSkills',NULL,'topspin,revers,pro','Bibliothèque pros'),

 ('ex_wang_chuqin_pivot','Pivot dynamique gaucher (Wang Chuqin)',
  'Pivot revers->coup droit en moins d''une seconde. Footwork + engagement.',
  'footwork','excelping',7,9,'timing',10,NULL,NULL,1,0,0,1,'table_duo','hard','pro_wang_chuqin',
  NULL,NULL,NULL,NULL,'footwork,pivot,pro','Bibliothèque pros'),

 ('ex_truls_moregard_banane','Banane revers (Truls Moregard)',
  'Le flick banane revers de Truls. Geste latéral court qui prend l''adversaire en contre-pied.',
  'topspin','techniping',6,9,'sequence',8,NULL,NULL,1,0,0,1,'table_duo','hard','pro_truls_moregard',
  NULL,NULL,NULL,NULL,'flip,banane,revers,pro','Bibliothèque pros'),

 ('ex_harimoto_explosif','Top-spin coup droit explosif (Harimoto)',
  'Le top-spin explosif de Harimoto sur 3e balle. Vitesse + placement.',
  'topspin','techniping',6,9,'sequence',7,NULL,NULL,1,0,0,1,'table_duo','hard','pro_harimoto',
  'https://www.youtube.com/watch?v=Jpqo4s6M4GQ','youtube','PingSkills',NULL,'topspin,3e_balle,pro','Bibliothèque pros'),

 ('ex_calderano_lefty_attack','Attaque gauchère diagonale (Calderano)',
  'Schéma gaucher : top-spin coup droit en diagonale large. Forte rotation.',
  'topspin','techniping',6,9,'amplitude',9,NULL,NULL,1,0,0,1,'table_duo','medium','pro_calderano',
  NULL,NULL,NULL,NULL,'topspin,diagonale,gaucher,pro','Bibliothèque pros'),

 ('ex_ovtcharov_allround','Jeu polyvalent : enchaîner 3 zones (Ovtcharov)',
  'Top-spin coup droit court -> revers long -> coup droit moyen. Lecture du jeu.',
  'tactic','jeuping',5,8,NULL,6,NULL,NULL,1,0,0,1,'table_duo','medium','pro_ovtcharov',
  NULL,NULL,NULL,NULL,'enchainement,zones,pro','Bibliothèque pros'),

 ('ex_boll_classic_european','Top-spin gaucher classique européen (Boll)',
  'Le top-spin pur école européenne. Geste long, engagement complet du corps.',
  'topspin','jeuping',5,8,'sequence',8,NULL,NULL,1,0,0,1,'table_duo','medium','pro_boll',
  NULL,NULL,NULL,NULL,'topspin,classique,pro','Bibliothèque pros'),

 ('ex_gauzy_defense','Défense haute liftée (Gauzy)',
  'Défendre loin de la table en liftant pour ramener la balle longue avec rotation.',
  'defense','techniping',6,9,'amplitude',10,NULL,NULL,1,0,0,1,'table_duo','medium','pro_gauzy',
  NULL,NULL,NULL,NULL,'defense,liftee,pro','Bibliothèque pros'),

 ('ex_gatien_legend','Drill historique champion 1993 (Gatien)',
  'Le drill que JP Gatien utilisait pour préparer ses championnats du monde. Fondamental.',
  'drive','baseping',3,5,'duration',5,NULL,NULL,1,0,0,1,'table_duo','easy','pro_gatien',
  'https://www.youtube.com/watch?v=GxAqmTLZLh0','youtube','PingSkills',NULL,'fondamentaux,pro','Bibliothèque pros');

-- Désactive les anciennes lignes pro_exercises au cas où une vue legacy les lirait
-- (la table reste, mais le catalogue lit désormais daily_drills uniquement).
