# Backlog UI — retours fondateur (vocal 31/07)

Converti du call fondateur. Priorisé. Réfs aux fichiers réels.
⚠️ Design **non figé** (Figma à venir) + certaines zones ont du **WIP non committé** → à coordonner.

## P0 — structurel (cœur des retours)

> ✅ **Fait 01/08** (#1 + début #2, commit à venir) : onglet **Profil** en bas-droite (Jouer · Classement · Accueil · Map · Profil). `profile.tsx` → `(tabs)/profil.tsx` ; `train.tsx` sorti des onglets → route `/train` (toujours accessible). Profil : bouton retour retiré, **onglet « Entraînements »** ajouté (liste séances + « Ajouter » → /new-training + « Voir tout » → /train), icône `person`, liens `/profile`→`/profil` (carte + accueil + e2e) mis à jour. **⚠️ à vérifier sur une build** (nav/visuel non testables ici). RESTE de #2 : carte joueur (droitier/gaucher, matériel), crayon d'édition, fusion stats/entraînements en 2 onglets épurés.

### 1. Profil dans le menu du bas (bottom-right)
> « il faut vraiment qu'on ait un endroit profil… partout, tu peux revenir vers ton profil » (35-40% des clics, réf LinkedIn).
- Aujourd'hui : 5 onglets **Défis · Ranking · Accueil · Map · Train** (`src/app/(tabs)/_layout.tsx`), pas d'onglet Profil. Profil = `src/app/profile.tsx` (écran stack, déjà « mon profil » via `session`).
- Cible : remplacer l'onglet **Train** par **Profil** (l'entraînement migre DANS le profil, cf. #2). Ordre : Jouer · Classement · Accueil · Map · **Profil**.
- Tech : déplacer/rendre `profile.tsx` comme écran de l'onglet `(tabs)/profil.tsx` ; garder `player.tsx` pour les autres joueurs.
- ⚠️ Conflit WIP : `(tabs)/train.tsx` est modifié non committé → committer/mettre au clair d'abord.

### 2. Profil revampé (Strava/chess.com, pas « trop Instagram »)
- Migrer **l'entraînement dans le profil** : « ajouter un entraînement = comme poster sur Instagram ». (profile.tsx charge déjà les séances.)
- Migrer les **graphes de progression** (ELO) sur le profil.
- **2 onglets** dans le profil : « Entraînements » (feed) + « Stats » (graphes).
- **Stats en haut** : matchs / victoires / amis (ou matchs / entraînements) — mais NE PAS copier la structure Instagram.
- Ajouter la **carte joueur** (le différenciateur vs chess.com) : droitier/gaucher, classement, **matériel**.
- « Ajouter un entraînement » = bouton visible **uniquement sur mon profil** (petit crayon), pas sur celui des autres. Enlever le bouton « Modifier », remplacer par un crayon discret.
- Réfs : `profile.tsx`, `player.tsx`, `(tabs)/train.tsx`, `src/lib/training/`.

### 3. Écran « Jouer » simplifié
> « hyper intuitive, 3-4 options : soit tu rejoins, soit tu crées. »
- Aujourd'hui : `src/app/(tabs)/jouer.tsx` (onglet « Défis »).
- Cible : hub à ~4 options claires (Rejoindre un défi / un tournoi · Créer un défi / un tournoi). « Rejoindre » liste défis + tournois lancés.
- **Créer = Premium** (gating) : non-premium = « rejoindre » seulement. (À câbler avec le futur flag premium / PostHog.)

## P1 — importantes V1

### 4. Grille d'explication du classement
> « une grille : points, différences de points, victoires/défaites, accessible quand tu fais un match, pour que les gens comprennent. »
- Nouveau composant explicatif (additif, faible risque) sur `(tabs)/classement.tsx` + accessible depuis l'écran de match.

### 5. Filtres du feed (Accueil)
> feed actuel « super bien ». Ajouter filtres **Tout le monde / Amis / Pays**.
- Réf : `src/app/(tabs)/index.tsx`.

### 6. Écrans d'erreur / 404 / retours bug
> « très très important… gérer les bugs, récupérer les retours utilisateurs. Travail de la V1. »
- États vides + écran 404 + un canal de feedback in-app.

### 7. Onboarding — étape « ajouter des amis »
> après les 5 questions + choix clubs : proposer d'**ajouter des amis** (gagne des utilisateurs). FFTT multi-noms → liste (déjà fait).
- Réf : `src/app/onboarding.tsx`.

## P2 — plus tard

### 8. Carte — fiches club
Clubs remplissent horaires + tél (outil de com pour eux). Filtres quartier à affiner. Réf : `(tabs)/carte.tsx`.

### 9. Feed enrichi
Encarts « viens faire ta séance » / marques, entraînements des pros (outil de progression). Réf : `(tabs)/index.tsx`.

### 10. Tournois — complétude des paramètres (retour Aaron)
Pools (3/4/5), tableau OK + KO. Une liste de questions couvrant tous les types de tournois nécessaires. Réf : `src/app/tournoi.tsx`, `src/lib/tournaments/`.

### 11. Matériel « collection » (V2/V3)
Scanner sa raquette → « tu joues avec la Cornilleau » ; marques payent pour être mises en avant.

### 12. Notifications
Marchent bien. Faire un point sur quelles notifs envoyer. Réf : `src/lib/push/`.
