-- Migration 028 — Bibliotheque d'exercices triee + videos demo.
--
-- Source de verite pedagogique (cf. CLAUDE.md §11) : research/ebooks/
--   - 01_livret_methode_francaise_FFTT.pdf  -> 5 etapes + contenus d'entrainement
--   - 02_table_tennis_playbook_pingsunday.pdf (Larcombe) -> schemas tactiques (plays)
--   - 04_cycle_5_seances_ligue_centre.pdf   -> ateliers decouverte (jonglage/mur/parcours)
--   - 05_entrainement_coup_droit_goldpingers.pdf -> seance coup droit structuree
--
-- Doc lisible compagnon : research/exercise-library.md (liste + liens video verifies).
--
-- ON ETEND la table daily_drills existante (mig 016, deja cablee a
-- workers/training-api/src/daily-drill.ts) plutot que de creer une table
-- concurrente. Les colonnes ajoutees ne cassent pas la selection existante.
--
-- Mapping FFTT etape -> tier (cf. mig 016 §M4.11) :
--   prepaping (Balle Blanche)  -> tier 1-3   (curieux / decouverte / casual)
--   baseping  (Balle Orange)   -> tier 3-5   (casual / regulier / intermediaire)
--   jeuping   (Bronze)         -> tier 4-6   (regulier / intermediaire / confirme)
--   techniping(Argent)         -> tier 6-8   (confirme / avance / expert)
--   excelping (Or)             -> tier 7-9   (avance / expert / competiteur)
--
-- targets_axis reste dans {timing|amplitude|sequence|duration|NULL} pour rester
-- compatible avec la selection contextuelle (axe kinetic faible) de daily-drill.ts :
--   timing   = anticipation / repositionnement / footwork
--   sequence = chaine cinetique / production de force / frappe
--   duration = regularite / endurance d'echange
--   amplitude= placement / precision des zones
--   NULL     = schema tactique multi-axes (fallback selection any-drill du tier)

-- =============================================================================
-- 1. Extension du schema daily_drills
-- =============================================================================

ALTER TABLE daily_drills ADD COLUMN fftt_stage       TEXT;             -- prepaping|baseping|jeuping|techniping|excelping
ALTER TABLE daily_drills ADD COLUMN targets_zone     TEXT;             -- notation Playbook : S/MID, L/BH, ... (CSV si plusieurs)
ALTER TABLE daily_drills ADD COLUMN requires_partner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_drills ADD COLUMN requires_robot   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_drills ADD COLUMN requires_wall    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_drills ADD COLUMN video_url        TEXT;             -- URL demo reelle verifiee (NULL = a filmer cote club/Josias)
ALTER TABLE daily_drills ADD COLUMN video_source     TEXT;             -- PingSkills | Tom Lodziak | Expert Table Tennis | FFTT (a filmer)
ALTER TABLE daily_drills ADD COLUMN tags             TEXT;             -- mots-cles CSV (recherche / matching IA futur)
ALTER TABLE daily_drills ADD COLUMN source           TEXT;             -- provenance pedagogique (doc research/ebooks)

CREATE INDEX IF NOT EXISTS idx_drills_stage ON daily_drills(fftt_stage, active);
CREATE INDEX IF NOT EXISTS idx_drills_cat   ON daily_drills(category, active);

-- =============================================================================
-- 2. Seed ~58 exercices tries par etape FFTT
-- =============================================================================
-- categorie : juggling|skill|drive|service|return|footwork|topspin|push|block
--             |counter|defense|tactic|match|fitness|mental

-- --- PREPAPING — Balle Blanche — decouverte (tier 1-3) -----------------------
INSERT OR IGNORE INTO daily_drills
  (id, name, description, category, fftt_stage, tier_min, tier_max, targets_axis,
   targets_zone, duration_min, goal_count, goal_metric,
   requires_partner, requires_robot, requires_wall, video_url, video_source, tags, source)
VALUES
 ('drill_jonglage_base', 'Jonglage de base',
  'Faire des rebonds sur la raquette sans faire tomber la balle. Maitriser la trajectoire verticale. Ameliorer son score a chaque passage.',
  'juggling', 'prepaping', 1, 3, 'duration', NULL, 4, 30, 'count>=30',
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-training-further-learning/3-proven-solo-table-tennis-drills-for-fast-improvement', 'PingSkills',
  'jonglage,controle,debutant,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_jonglage_cd', 'Jonglage coup droit',
  'Rebonds uniquement cote coup droit, raquette horizontale. Stabiliser le contact balle-raquette du cote coup droit.',
  'juggling', 'prepaping', 1, 3, 'duration', NULL, 4, 25, 'count>=25',
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills', 'jonglage,coup_droit,debutant,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_jonglage_revers', 'Jonglage revers',
  'Rebonds uniquement cote revers. Travaille le toucher de balle du cote faible chez la majorite des debutants.',
  'juggling', 'prepaping', 1, 3, 'duration', NULL, 4, 25, 'count>=25',
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills', 'jonglage,revers,debutant,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_jonglage_alterne', 'Jonglage alterne CD/revers',
  'Alterner un rebond coup droit puis un rebond revers (rotation du poignet). Prepare la differenciation coup droit / revers.',
  'juggling', 'prepaping', 2, 4, 'sequence', NULL, 4, 20, 'count>=20',
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills', 'jonglage,liaison,poignet,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_jonglage_hauteurs', 'Jonglage hauteurs variees',
  'Faire varier la hauteur des rebonds (bas/haut) sans perdre le controle. Dosage de l''energie du geste.',
  'juggling', 'prepaping', 2, 4, 'amplitude', NULL, 5, 20, 'count>=20',
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills', 'jonglage,dosage,controle,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_parcours_balle', 'Parcours balle sur raquette',
  'Se deplacer sur un slalom (plots/cerceaux) en gardant la balle posee sur la raquette sans la faire tomber. Concentration, tonicite, mobilite du poignet.',
  'skill', 'prepaping', 1, 3, 'timing', NULL, 5, NULL, NULL,
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills', 'coordination,equilibre,mobilite,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_mur_cd', 'Jeu contre le mur — coup droit',
  'Renvoyer la balle cote coup droit contre un mur, 3 fois de suite minimum. Position du corps et de la raquette, concentration. Varier les vitesses.',
  'drive', 'prepaping', 1, 4, 'duration', NULL, 6, 10, 'count>=10',
  0, 0, 1, 'https://www.tabletenniscoach.me.uk/table-tennis-at-home/', 'Tom Lodziak', 'coup_droit,regularite,mur,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_mur_revers', 'Jeu contre le mur — revers',
  'Renvoyer la balle cote revers contre un mur, 3 fois de suite minimum. Stabiliser le geste revers en autonomie.',
  'drive', 'prepaping', 1, 4, 'duration', NULL, 6, 10, 'count>=10',
  0, 0, 1, 'https://www.tabletenniscoach.me.uk/table-tennis-at-home/', 'Tom Lodziak', 'revers,regularite,mur,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_mur_alterne', 'Jeu contre le mur — alterne CD/revers',
  'Renvoyer alternativement coup droit puis revers contre le mur, 2 fois de suite minimum. Premiere liaison des deux coups.',
  'drive', 'prepaping', 2, 4, 'sequence', NULL, 6, 8, 'count>=8',
  0, 0, 1, 'https://www.tabletenniscoach.me.uk/table-tennis-at-home/', 'Tom Lodziak', 'liaison,mur,solo', 'FFTT Cycle 5 seances (Ligue Centre)'),

 ('drill_service_regl_cd', 'Service reglementaire place — coup droit',
  'Lancer la balle, la frapper dans la descente, un rebond de chaque cote. Reussir 7 a 10 services sur 10. Sans effet, place.',
  'service', 'prepaping', 1, 4, 'amplitude', 'S/MID', 6, 10, 'success_rate>=0.7',
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/improve-serves-solo-service-practice/', 'Tom Lodziak',
  'service,reglementaire,coup_droit,solo', 'FFTT Methode Francaise (prepaping)'),

 ('drill_service_regl_revers', 'Service reglementaire place — revers',
  'Service revers sans effet, place et reglementaire. Reussir 7 a 10 sur 10. Base du service avant maquillage des effets.',
  'service', 'prepaping', 2, 5, 'amplitude', 'S/BH', 6, 10, 'success_rate>=0.7',
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/improve-serves-solo-service-practice/', 'Tom Lodziak',
  'service,reglementaire,revers,solo', 'FFTT Methode Francaise (prepaping)'),

 ('drill_renvoi_cd_demi', 'Renvoi regulier — coup droit demi-table',
  'Maintenir un echange regulier en coup droit sur la demi-table adverse. Geste simple oriente vers l''avant et le haut.',
  'drive', 'prepaping', 2, 4, 'duration', 'L/FH', 8, 20, 'rally>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills',
  'coup_droit,regularite,echange', 'FFTT Methode Francaise (prepaping)'),

 ('drill_renvoi_revers_demi', 'Renvoi regulier — revers demi-table',
  'Maintenir un echange regulier en revers sur la demi-table adverse. Stabiliser le geste de renvoi revers.',
  'drive', 'prepaping', 2, 4, 'duration', 'L/BH', 8, 20, 'rally>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills',
  'revers,regularite,echange', 'FFTT Methode Francaise (prepaping)'),

 ('drill_deplacement_lateral', 'Deplacements lateraux simples',
  'Pas chasses lateraux courts a vide ou sur balle facile, jambes flechies, allegement des appuis. Apprendre a bouger juste.',
  'footwork', 'prepaping', 1, 4, 'timing', NULL, 5, NULL, NULL,
  0, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-footwork/footwork-basics', 'PingSkills', 'deplacement,appuis,mobilite,solo', 'FFTT Methode Francaise (prepaping)'),

 ('drill_echauffement_hors_table', 'Echauffement hors table — jeux d''opposition',
  'Jeux de poursuite et d''opposition hors table : developpe la mobilite, le cote malin et l''attitude dynamique.',
  'fitness', 'prepaping', 1, 3, NULL, NULL, 8, NULL, NULL,
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/how-to-warm-up-before-a-match/', 'Tom Lodziak', 'echauffement,mobilite,ludique', 'FFTT Methode Francaise (prepaping)'),

-- --- BASEPING — Balle Orange — structurer son jeu (tier 3-5) ----------------
 ('drill_cd_50_echanges', 'Coup droit moitie de table — 50 echanges',
  'Le partenaire (ou robot) joue uniquement dans le coup droit. Objectif : 50 echanges consecutifs sans faute. Monter l''intensite progressivement.',
  'drive', 'baseping', 3, 6, 'duration', 'L/FH', 10, 50, 'rally>=50',
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills',
  'coup_droit,regularite,placement', 'GoldPingers — seance coup droit'),

 ('drill_revers_regularite', 'Revers moitie de table — regularite',
  'Echange regulier en revers, 50 balles cibles. Stabiliser la frappe revers avant d''accelerer.',
  'drive', 'baseping', 3, 6, 'duration', 'L/BH', 10, 50, 'rally>=50',
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/most-important-skill', 'PingSkills',
  'revers,regularite', 'FFTT Methode Francaise (baseping)'),

 ('drill_placement_lateral_cd', 'Placement lateral — croiser/decroiser coup droit',
  'Jouer le coup droit alternativement en diagonale puis en ligne (decroiser). Maitriser l''orientation du geste et de la raquette.',
  'drive', 'baseping', 3, 6, 'amplitude', 'L/FH,L/BH', 10, NULL, NULL,
  1, 0, 0, 'https://www.tabletenniscoach.me.uk/5-training-drills-switching-forehand-backhand-strokes/', 'Tom Lodziak', 'placement,diagonale,ligne,coup_droit', 'FFTT Methode Francaise (baseping)'),

 ('drill_liaison_cd_revers_1_1', 'Liaison coup droit / revers (1-1)',
  'Un coup droit, un revers en alternance regulier. Equilibrage CD/revers, replacement entre les deux coups.',
  'footwork', 'baseping', 3, 6, 'sequence', 'L/FH,L/BH', 10, 30, 'rally>=30',
  1, 0, 0, 'https://www.tabletenniscoach.me.uk/5-training-drills-switching-forehand-backhand-strokes/', 'Tom Lodziak', 'liaison,replacement,coup_droit,revers', 'FFTT Methode Francaise (baseping)'),

 ('drill_service_court_sans_effet', 'Service court place sans effet',
  'Service court (deux rebonds cote adverse) place, sans effet. Base avant le travail des effets et du maquillage.',
  'service', 'baseping', 3, 6, 'amplitude', 'S/MID', 8, 10, 'success_rate>=0.7',
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/improve-serves-solo-service-practice/', 'Tom Lodziak',
  'service,court,placement,solo', 'FFTT Methode Francaise (baseping)'),

 ('drill_service_long_rapide', 'Service long rapide',
  'Service long et rapide qui rebondit pres de la ligne de fond adverse. Vitesse + placement, sans le rendre lisible.',
  'service', 'baseping', 4, 7, 'amplitude', 'L/BH,L/FH', 8, 10, 'success_rate>=0.7',
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/improve-serves-solo-service-practice/', 'Tom Lodziak',
  'service,long,vitesse,solo', 'FFTT Methode Francaise (baseping)'),

 ('drill_retour_service_place', 'Retour de service place',
  'Remettre le service de maniere placee (pas seulement remettre : choisir une zone). Lecture trajectoire + decision.',
  'return', 'baseping', 4, 7, 'amplitude', 'L/BH', 8, NULL, NULL,
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'retour,remise,placement', 'FFTT Methode Francaise (baseping)'),

 ('drill_deplacement_pivot', 'Deplacement lateral + pivot',
  'Travailler le deplacement lateral puis le pivot (se decaler pour jouer coup droit cote revers). Coordination jambes.',
  'footwork', 'baseping', 4, 7, 'timing', 'L/BH', 8, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/the-falkenberg-drill/', 'Expert Table Tennis',
  'deplacement,pivot,footwork', 'FFTT Methode Francaise (baseping)'),

 ('drill_cd_croise_ligne', 'Coup droit croise et ligne droite',
  'Alterner un coup droit croise (diagonale) avec un coup droit en ligne droite. Varier puissance et rotation (top-spin, frappe seche, balle lente).',
  'drive', 'baseping', 4, 7, 'amplitude', 'L/FH,L/BH', 10, NULL, NULL,
  1, 0, 0, 'https://www.tabletenniscoach.me.uk/5-training-drills-switching-forehand-backhand-strokes/', 'Tom Lodziak', 'coup_droit,diagonale,ligne,variation', 'GoldPingers — seance coup droit'),

 ('drill_cd_deplacement_aleatoire', 'Coup droit avec deplacement (balle aleatoire)',
  'Le partenaire envoie la balle aleatoirement dans la demi-table : se deplacer pour tout jouer en coup droit, retour en position neutre apres chaque coup.',
  'footwork', 'baseping', 4, 7, 'timing', 'L/FH,L/MID,L/BH', 10, NULL, NULL,
  1, 1, 0, 'https://www.tabletenniscoach.me.uk/video/move-your-feet-5-drills-to-transform-your-footwork/', 'Tom Lodziak', 'coup_droit,deplacement,appuis,replacement', 'GoldPingers — seance coup droit'),

 ('drill_panier_contre_attaque_cd', 'Panier de balles — contre-attaque coup droit',
  'Le distributeur envoie des balles au panier, le joueur enchaine des contre-attaques coup droit. Accelere l''apprentissage du coup.',
  'drive', 'baseping', 4, 7, 'sequence', 'L/FH', 8, 40, 'count>=40',
  1, 1, 0, NULL, 'FFTT (a filmer)', 'panier,contre_attaque,coup_droit', 'FFTT Methode Francaise (baseping)'),

 ('drill_jeux_comptes', 'Jeux comptes / formes competitives',
  'Mini-matchs avec contrainte (zones imposees, sets courts). Developpe le gain du point et le cote malin/combatif.',
  'match', 'baseping', 3, 6, NULL, NULL, 12, NULL, NULL,
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-training-further-learning/the-practice-routine-that-will-transform-your-table-tennis-game', 'PingSkills', 'match,competition,tactique', 'FFTT Methode Francaise (baseping)'),

 ('drill_educatifs_pied', 'Educatifs du pied / coordination',
  'Echelle de rythme, pas chasses, sauts : coordination et legerete des appuis specifique tennis de table.',
  'fitness', 'baseping', 3, 6, 'timing', NULL, 8, NULL, NULL,
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/video/move-your-feet-5-drills-to-transform-your-footwork/', 'Tom Lodziak', 'coordination,appuis,fitness,solo', 'FFTT Methode Francaise (baseping)'),

-- --- JEUPING — Raquette de Bronze — continuer a structurer (tier 4-6) -------
 ('drill_topspin_cd_coupe', 'Top-spin coup droit sur balle coupee',
  'Le partenaire pousse des balles coupees dans le coup droit : demarrer en top-spin en relevant la balle (angle de raquette + rotation), avec controle.',
  'topspin', 'jeuping', 5, 8, 'sequence', 'L/FH', 10, 25, 'count>=25',
  1, 1, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'topspin,coup_droit,demarrage,balle_coupee', 'GoldPingers — seance coup droit'),

 ('drill_topspin_revers_coupe', 'Top-spin revers sur balle coupee',
  'Demarrer en top-spin revers sur poussette coupee. Frotter la balle par-dessous puis par-dessus, qualite du contact.',
  'topspin', 'jeuping', 5, 8, 'sequence', 'L/BH', 10, 25, 'count>=25',
  1, 1, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'topspin,revers,demarrage,balle_coupee', 'FFTT Methode Francaise (jeuping)'),

 ('drill_poussette_cd', 'Poussette coup droit — regularite',
  'Echange de poussettes coupees en coup droit. Frotter par-dessous, garder court et bas. Base du petit jeu.',
  'push', 'jeuping', 4, 7, 'duration', 'S/FH', 8, 30, 'rally>=30',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'poussette,coup_droit,coupe,petit_jeu', 'FFTT Methode Francaise (jeuping)'),

 ('drill_poussette_revers', 'Poussette revers — regularite',
  'Echange de poussettes revers, balle coupee et basse. Le coup le plus utilise dans le petit jeu.',
  'push', 'jeuping', 4, 7, 'duration', 'S/BH', 8, 30, 'rally>=30',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'poussette,revers,coupe,petit_jeu', 'FFTT Methode Francaise (jeuping)'),

 ('drill_bloc_revers', 'Bloc revers contre top-spin',
  'Bloquer le top-spin adverse en revers : angle de raquette ferme, absorption. Controle de la rotation avant adverse.',
  'block', 'jeuping', 5, 8, 'timing', 'L/BH', 8, 30, 'rally>=30',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'bloc,revers,defense,topspin_adverse', 'FFTT Methode Francaise (jeuping)'),

 ('drill_bloc_cd', 'Bloc coup droit contre top-spin',
  'Bloc coup droit actif/passif contre top-spin. Tenir la table, controler la balle a mi-distance.',
  'block', 'jeuping', 5, 8, 'timing', 'L/FH', 8, 30, 'rally>=30',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'bloc,coup_droit,defense', 'FFTT Methode Francaise (jeuping)'),

 ('drill_service_attaque_3e_balle', 'Enchainement service + attaque 3e balle',
  'Servir (court coupe ou lateral) puis attaquer en coup droit sur la remise. Alterner attaque diagonale et ligne. Schema tactique de base.',
  'tactic', 'jeuping', 5, 8, NULL, 'S/MID', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'service,3e_balle,attaque,schema', 'GoldPingers + Playbook Larcombe'),

 ('drill_play_opening_up', 'Schema "Opening up" (Larcombe)',
  '1) Service court coupe au milieu. 2) Adversaire pousse long (dig) coup droit. 3) Top-spin coup droit ligne sur revers. 4) Bloc revers adverse. 5) Top-spin revers ligne. 6) Jeu libre. Travaille l''attaque 3e balle sur balle coupee.',
  'tactic', 'jeuping', 5, 8, NULL, 'S/MID,L/FH,L/BH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,service_court,topspin,3e_balle', 'Playbook Larcombe (PingSunday)'),

 ('drill_topspin_sur_bloc', 'Top-spin sur bloc — regularite',
  'Le partenaire bloque, le joueur enchaine des top-spins coup droit reguliers. Continuite + qualite de contact.',
  'topspin', 'jeuping', 5, 8, 'duration', 'L/FH', 10, 20, 'rally>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'topspin,bloc,regularite,enchainement', 'FFTT Methode Francaise (jeuping)'),

 ('drill_falkenberg', 'Falkenberg drill (revers — pivot CD — CD)',
  'Sequence : revers coin revers, puis pivot coup droit depuis le coin revers, puis coup droit grand cote. Footwork lateral + step-around. Rester equilibre, revenir vite en position.',
  'footwork', 'jeuping', 6, 9, 'timing', 'L/BH,L/FH', 10, 20, 'rally>=20',
  1, 0, 0, 'https://www.experttabletennis.com/the-falkenberg-drill/', 'Expert Table Tennis',
  'falkenberg,footwork,pivot,deplacement', 'Playbook / Expert Table Tennis'),

 ('drill_match_theme_cd', 'Match a theme — jouer uniquement coup droit',
  'Match en forcant l''utilisation du coup droit (si possible). Renforce les automatismes et le positionnement en situation.',
  'match', 'jeuping', 5, 8, NULL, NULL, 10, NULL, NULL,
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-training-further-learning/the-practice-routine-that-will-transform-your-table-tennis-game', 'PingSkills', 'match,theme,coup_droit,tactique', 'GoldPingers — seance coup droit'),

-- --- TECHNIPING — Raquette d'Argent — varier son jeu (tier 6-8) -------------
 ('drill_play_flicking_out', 'Schema "Flicking out" (Larcombe)',
  '1) Service court coupe ligne. 2) Touch coup droit adverse sur revers. 3) Flip revers diagonale. 4) Bloc adverse ligne. 5) Top-spin coup droit diagonale. 6) Libre. Travaille l''attaque 3e balle au flip.',
  'tactic', 'techniping', 6, 9, NULL, 'S/BH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,flip,3e_balle,service_court', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_short_topspin', 'Schema "Short topspin serve" (Larcombe)',
  '1) Service court lifte ligne. 2) Flip coup droit adverse large CD. 3) Top-spin coup droit milieu. 4) Bloc coup droit adverse milieu. 5) Top-spin coup droit revers. 6) Libre. Etre pret a topspiner derriere un flip adverse.',
  'tactic', 'techniping', 6, 9, NULL, 'S/FH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,service_lifte,topspin', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_touch_open_up', 'Schema "Touch & open up" (retour, Larcombe)',
  '1) Adversaire sert court coupe milieu. 2) Touch coup droit sur son coup droit. 3) Dig coup droit adverse milieu. 4) Open-up coup droit sur son revers. 5) Libre. Travaille la remise courte + ouverture 4e balle.',
  'tactic', 'techniping', 6, 9, NULL, 'S/MID', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,retour,touch,open_up,4e_balle', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_dig_counter', 'Schema "Dig & counter" (retour, Larcombe)',
  '1) Adversaire sert court coupe revers. 2) Dig revers profond sur son coup droit. 3) Top-spin coup droit adverse (open up). 4) Contre top-spin coup droit dans son crossover. 5) Libre. Anticiper l''attaque sur la poussette longue.',
  'tactic', 'techniping', 7, 9, NULL, 'S/BH,L/FH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,retour,dig,contre,anticipation', 'Playbook Larcombe (PingSunday)'),

 ('drill_defense_coupee', 'Defense coupee (loin de la table)',
  'Defendre en coupant loin de la table pour ramener la balle longue avec rotation arriere. Affiner les sensations balle-raquette.',
  'defense', 'techniping', 6, 9, 'amplitude', 'L/BH,L/FH', 10, 20, 'rally>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'defense,coupee,rotation,loin_table', 'FFTT Methode Francaise (techniping)'),

 ('drill_defense_haute_liftee', 'Defense haute liftee',
  'Defendre en liftant haut pour repousser l''attaque adverse loin. Variante de defense a maitriser cote techniping.',
  'defense', 'techniping', 6, 9, 'amplitude', 'L/BH', 10, 15, 'rally>=15',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'defense,liftee,haute', 'FFTT Methode Francaise (techniping)'),

 ('drill_poussette_courte_longue', 'Poussette courte vs longue tendue',
  'Varier poussette courte (deux rebonds) et poussette longue tendue (rapide, profonde) pour gener le demarrage adverse.',
  'push', 'techniping', 6, 9, 'amplitude', 'S/MID,L/BH', 10, NULL, NULL,
  1, 0, 0, 'https://www.tabletenniscoach.me.uk/tag/training-drill/', 'Tom Lodziak',
  'poussette,variation,court,long,petit_jeu', 'FFTT Methode Francaise (techniping)'),

 ('drill_flip_balle_courte', 'Flip sur balle courte',
  'Attaquer une balle courte au flip (coup droit ou revers). Solution offensive sur le jeu court, peu utilisee a ce niveau.',
  'topspin', 'techniping', 6, 9, 'sequence', 'S/MID', 8, 20, 'count>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'flip,balle_courte,attaque', 'FFTT Methode Francaise (techniping)'),

 ('drill_jeu_de_contre', 'Jeu de contre (mi-distance)',
  'Echange de contre-attaques top-spin contre top-spin a mi-distance. Resister a la pression, se creer des occasions par vitesse/placement.',
  'counter', 'techniping', 7, 9, 'sequence', 'L/FH,L/BH', 10, 20, 'rally>=20',
  1, 0, 0, 'https://www.pingskills.com/tutorials', 'PingSkills',
  'contre,topspin,mi_distance,pression', 'FFTT Methode Francaise (techniping)'),

 ('drill_gainage_posture', 'Gainage + posture pongiste',
  'Renforcement gainage et posture specifique : stabilite du tronc pour la chaine cinetique. Maintenir chaque position 20-30s.',
  'fitness', 'techniping', 6, 9, NULL, NULL, 10, NULL, NULL,
  0, 0, 0, NULL, 'FFTT (a filmer)', 'gainage,posture,fitness,prepa_physique,solo', 'FFTT Methode Francaise (techniping)'),

 ('drill_gestion_temps_repos', 'Gestion des temps de repos entre les points',
  'Routine entre les points : respiration, regard, reset mental. Travaille la presence (axe 3 Josias) et la gestion d''une partie.',
  'mental', 'techniping', 6, 9, NULL, NULL, 5, NULL, NULL,
  0, 0, 0, 'https://www.tabletenniscoach.me.uk/video/too-tense-how-to-relax-when-playing-matches/', 'Tom Lodziak', 'mental,presence,routine,reset', 'FFTT Methode Francaise (techniping)'),

-- --- EXCELPING — Raquette d'Or — s'adapter a l'adversaire (tier 7-9) --------
 ('drill_play_long_pendulum', 'Schema "Long pendulum" (Larcombe)',
  '1) Service lateral pendulum long, large revers. 2) Top-spin revers adverse. 3) Contre top-spin revers milieu. 4) Bloc coup droit adverse. 5) Top-spin coup droit diagonale. 6) Libre. Gerer le 3e ballon cote revers apres service lateral long.',
  'tactic', 'excelping', 7, 9, NULL, 'L/BH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,service_lateral,long,contre', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_down_the_line', 'Schema "Down the line" (Larcombe)',
  '1) Service rapide lifte ligne sur coup droit. 2) Top-spin coup droit adverse. 3) Contre coup droit milieu. 4) Bloc revers adverse milieu. 5) Top-spin coup droit milieu. 6) Libre. Pince l''adversaire sur son crossover.',
  'tactic', 'excelping', 7, 9, NULL, 'L/FH,L/MID', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,service_ligne,rapide,crossover', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_topspin_counter', 'Schema "Topspin & counter" (retour, Larcombe)',
  '1) Adversaire sert lateral long large revers. 2) Top-spin revers sur son milieu. 3) Contre top-spin coup droit adverse. 4) Contre coup droit en diagonale. 5) Libre. Rester a la table en topspin-topspin.',
  'tactic', 'excelping', 7, 9, NULL, 'L/BH,L/FH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,retour,contre,agressif', 'Playbook Larcombe (PingSunday)'),

 ('drill_play_topspin_topspin', 'Schema "Topspin & topspin" (retour, Larcombe)',
  '1) Adversaire sert long lifte milieu. 2) Top-spin coup droit fort large CD. 3) Bloc coup droit adverse. 4) Top-spin coup droit diagonale. 5) Libre. Forcer le bloc puis finir au 4e ballon.',
  'tactic', 'excelping', 7, 9, NULL, 'L/MID,L/FH', 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'schema,retour,topspin,4e_balle,finition', 'Playbook Larcombe (PingSunday)'),

 ('drill_irregularite_4e_balle', 'Irregularite 4e balle (anticipation)',
  'Schema dirige ou le 4e ballon adverse part au choix revers OU coup droit : le joueur doit attendre et anticiper avant de jouer le 5e. Travaille l''axe anticipation (Josias).',
  'tactic', 'excelping', 7, 9, 'timing', NULL, 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'anticipation,irregularite,lecture,demi_libre', 'Playbook Larcombe (PingSunday)'),

 ('drill_variation_rythme_rotation', 'Variation rythme/rotation sur un meme coup',
  'Jouer le meme coup en variant rotation, puissance, vitesse, hauteur, trajectoire pour destabiliser l''adversaire. Coeur de l''etape excelping.',
  'drive', 'excelping', 7, 9, 'amplitude', NULL, 10, NULL, NULL,
  1, 0, 0, 'https://www.tabletenniscoach.me.uk/video/my-service-secret-guaranteed-extra-points/', 'Tom Lodziak', 'variation,rotation,rythme,destabiliser', 'FFTT Methode Francaise (excelping)'),

 ('drill_coup_terminal_systeme', 'Coup terminal adapte au systeme de jeu',
  'Construire et repeter le coup qui termine le point selon son systeme de jeu (ex : top-spin coup droit diagonale). Rentabiliser son ADN.',
  'tactic', 'excelping', 7, 9, 'sequence', NULL, 10, NULL, NULL,
  1, 0, 0, 'https://www.pingskills.com/tutorials/table-tennis-strokes/forehand-smash', 'PingSkills', 'coup_terminal,systeme_de_jeu,finition,adn', 'FFTT Methode Francaise (excelping)'),

 ('drill_service_relance_signature', 'Service + relance signature (ADN de jeu)',
  'Travailler la combinaison service prefere -> enchainement signature adapte a son systeme de jeu et a l''adversaire. Schema personnel a optimiser.',
  'tactic', 'excelping', 8, 9, NULL, NULL, 12, NULL, NULL,
  1, 0, 0, 'https://www.experttabletennis.com/playbook', 'Expert Table Tennis',
  'service,schema_signature,adversaire,adn', 'FFTT Methode Francaise (excelping) + Playbook');
