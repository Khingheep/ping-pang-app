-- Migration 036 — Comble la banque vidéo : +47 vidéos YouTube embeddables.
--
-- Suite de la mig 035 (qui avait câblé ~19 vidéos). On ajoute une vidéo YouTube
-- réelle sur quasiment tous les exercices restants : jonglage, mur, footwork,
-- régularité, bloc, poussette, défense, schémas tactiques Larcombe, coups pros.
--
-- ⚠ MÉTHODE (anti-URL-inventée, cf. mig 035 + research/exercise-library.md §3) :
--   chaque ID vidéo provient d'une recherche web réelle, puis a été vérifié via
--   l'endpoint oEmbed de YouTube (https://www.youtube.com/oembed) :
--     - HTTP 200 = la vidéo existe ET est EMBEDDABLE (on l'affiche en iframe) ;
--     - le titre + author_name renvoyés par oEmbed ont confirmé le bon thème et
--       la vraie chaîne (video_source ci-dessous = author_name réel d'oEmbed).
--   2 vidéos candidates ont été REJETÉES (oEmbed 401/403 = embed désactivé) :
--     - "Ball Bounce" (23P4SY1PRL0) → remplacée par PingSkills "Practicing Alone".
--     - "Footwork & Coordination 13 ex" (iVblJwyF2xE) → remplacée par Tom Lodziak.
--
-- Non câblés (restent en "Vidéo bientôt" / lien tuto) :
--   - drill_parcours_balle      : aucune vidéo TT fiable (résultats = tennis).
--   - drill_match_theme_cd       : pas de vraie vidéo "match coup droit only".
--   - drill_panier_contre_attaque_cd, drill_gainage_posture : à filmer (Josias/club).
--
-- video_provider='youtube' → embed inline (cf apps/training/app/library/page.tsx).
-- ⚠ Migration manuelle (cf docs/BACKEND.md §2). Régénérer schema.sql après application.

-- =============================================================================
-- PRÉPAPING — découverte (jonglage / mur / renvoi / footwork / échauffement)
-- =============================================================================
-- Jonglage + jeu au mur : PingSkills "Practicing Alone" couvre le contrôle de
-- balle solo (rebonds CD/revers, faces de raquette, jeu contre le mur).
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=aG40Jnpi0EU', video_provider='youtube', video_source='PingSkills'
  WHERE id IN ('drill_jonglage_base','drill_jonglage_cd','drill_jonglage_revers',
               'drill_jonglage_alterne','drill_jonglage_hauteurs',
               'drill_mur_cd','drill_mur_revers','drill_mur_alterne');

UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=W_ZfwwhGsl8', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_renvoi_revers_demi';                              -- Backhand Lesson: Master the Basics
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=f3QwxKWHKbU', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id IN ('drill_deplacement_lateral','drill_educatifs_pied'); -- Footwork for beginners
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=3GJyHzf15N8', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_echauffement_hors_table';                        -- Physical Warm Up

-- =============================================================================
-- BASEPING — structurer (régularité / placement / liaison / footwork / jeux)
-- =============================================================================
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=GI7rX5-90DQ', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_revers_regularite';                              -- Backhand Counterhit
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=QjB6P3Ht1jc', video_provider='youtube', video_source='Ping To Pong'
  WHERE id='drill_placement_lateral_cd';                           -- FH Down the Line / Cross court
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=phM_uZ1IDDU', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_liaison_cd_revers_1_1';                          -- Switching BH/FH
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=6_kTGwxqeMM', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_deplacement_pivot';                              -- FH attacks from BH corner (pivot)
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=sMsSiRbMrUs', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_cd_croise_ligne';                                -- Unstoppable forehand attack
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=RUQcMuzgVBI', video_provider='youtube', video_source='Table Tennis University'
  WHERE id='drill_cd_deplacement_aleatoire';                       -- FH Wide / FH Middle footwork
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=XsZp8nTjZ2c', video_provider='youtube', video_source='TableTennisDaily'
  WHERE id='drill_jeux_comptes';                                   -- 3 Best Drills To Improve Match Play

-- =============================================================================
-- JEUPING — continuer à structurer (bloc / 3e balle / schéma / footwork)
-- =============================================================================
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=q-gQutk9tgo', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_bloc_revers';                                    -- Backhand Block
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=V021kGUUTsU', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_bloc_cd';                                        -- Forehand Block
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=zYOwkAb302k', video_provider='youtube', video_source='Spin Your Enemy'
  WHERE id='drill_service_attaque_3e_balle';                       -- Attack 3rd ball with confidence
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=NWw_1SO3TV0', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_play_opening_up';                                -- Topspin Against Backspin (open up)
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=4D4Tvm9r_ug', video_provider='youtube', video_source='Dublin Table Tennis Club'
  WHERE id='drill_falkenberg';                                     -- Falkenberg drill tutorial

-- =============================================================================
-- TECHNIPING — varier (flip / schémas retour / défense / contre / mental)
-- =============================================================================
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=ytqn4FQASNI', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_play_flicking_out';                              -- Attack short backspin serves (flick)
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=sEdPqz4UfdM', video_provider='youtube', video_source='Acceleraq'
  WHERE id='drill_play_short_topspin';                             -- Short Topspin Pendulum Serve
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=CvevK1yKl8s', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_play_touch_open_up';                             -- Tactics Against a Short Pusher
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=J_8yZa3b7P4', video_provider='youtube', video_source='Ti Long'
  WHERE id='drill_play_dig_counter';                               -- Serve long and counterattack
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=gSSlb_5aEvk', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_defense_coupee';                                 -- How to do wicked chops
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=Hnpw8WfdLWg', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_defense_haute_liftee';                           -- Lob Against Smash
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=mC0H6OLL_4M', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_flip_balle_courte';                              -- Forehand Flick
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=-3O1JaVzMDw', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_jeu_de_contre';                                  -- Counter Topspin
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=YdhtpH-h3rE', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_gestion_temps_repos';                            -- How to relax when playing matches

-- =============================================================================
-- EXCELPING — s'adapter (schémas Larcombe / anticipation / variation / finition)
-- =============================================================================
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=NFCgf-41SmM', video_provider='youtube', video_source='Tom Lodziak'
  WHERE id='drill_play_long_pendulum';                             -- Sidespin (pendulum) serve tactics
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=Q5x4kraM2ZI', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_play_down_the_line';                             -- Crossover Point Accuracy
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=aOEJAKVZqVg', video_provider='youtube', video_source='Ti Long'
  WHERE id='drill_play_topspin_counter';                           -- Improved BH Topspin Counterattack
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=ERophnSXQCo', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_play_topspin_topspin';                           -- Topspin vs Topspin
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=Wg_GJsHQpTE', video_provider='youtube', video_source='Acceleraq'
  WHERE id='drill_irregularite_4e_balle';                          -- Drill to improve reaction time
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=30zKrRSY0PE', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_variation_rythme_rotation';                      -- Forehand Topspin Variations
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=T8dHrFpZ8LA', video_provider='youtube', video_source='PingSkills'
  WHERE id='drill_coup_terminal_systeme';                          -- Forehand Smash (finishing shot)

-- =============================================================================
-- BIBLIOTHÈQUE PROS — coups signature (analyse joueur ou technique du coup)
-- =============================================================================
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=q-gQutk9tgo', video_provider='youtube', video_source='PingSkills'
  WHERE id='ex_lebrun_alexis_block';                               -- Backhand Block (technique du coup)
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=rTdRRUgJqUA', video_provider='youtube', video_source='Table Tennis Footage'
  WHERE id='ex_wang_chuqin_pivot';                                 -- Wang Chuqin FH preparation
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=WcJutWacEQU', video_provider='youtube', video_source='Ti Long'
  WHERE id='ex_truls_moregard_banane';                             -- Backhand Banana Flick
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=fewjT9bJMuk', video_provider='youtube', video_source='Attitude Ping'
  WHERE id='ex_calderano_lefty_attack';                            -- Topspin CD Calderano (analyse FR)
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=5zox22abPzQ', video_provider='youtube', video_source='TableTennisDaily'
  WHERE id='ex_ovtcharov_allround';                                -- Ovtcharov 3 Point FH Training
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=j19XOYZsli8', video_provider='youtube', video_source='jacksonmeyn'
  WHERE id='ex_boll_classic_european';                             -- Timo Boll FH Topspin Slow Motion
UPDATE daily_drills SET video_url='https://www.youtube.com/watch?v=5fnM1EAI9Qc', video_provider='youtube', video_source='Doctor Karol Table Tennis'
  WHERE id='ex_gauzy_defense';                                     -- Can Simon Gauzy Improve Your Backhand
