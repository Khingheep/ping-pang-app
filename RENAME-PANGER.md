# Renommage Ping Pang Paris → Panger

Suivi du rebranding. Fait le 01/08/2026. Certaines étapes sont **coordonnées** (elles cassent
l'auth ou les builds si faites à l'aveugle) → à exécuter dans l'ordre, avec vérif.

## ✅ Fait (sûr, sans impact sur le TestFlight actuel)
- `app.json` : `name` → **Panger** ; bundle prod `ios.bundleIdentifier` + `android.package` → **`paris.panger.app`** ; textes de permission (localisation, photos, caméra) → « Panger ».
- Copie in-app visible → « Panger » : écran login, welcome, onboarding, signalement joueur, badge de match (profil), placeholder recherche joueur (new-training), message de partage de tournoi, **nom du canal de notif Android**.
- Landing page **Panger** live : https://panger-landing.pages.dev

> La **beta TestFlight n'est pas touchée** : le profil `beta` garde le bundle neutre `com.wbz.rcbeta`
> (variant RC Beta). Seuls les futurs builds `production` (et dev/preview) utilisent `paris.panger.app`.

## ⚠️ À faire — étapes coordonnées (NE PAS improviser)

### 1. Scheme deep-link (`pingpangparis` → `panger`) — casse l'OAuth si mal fait
`app.json` garde `scheme: "pingpangparis"` pour l'instant. Le changer impose de mettre à jour, EN MÊME TEMPS :
- les **redirect URLs** dans Supabase (Auth → URL Configuration),
- les **redirect URIs** Google OAuth + Apple Sign In,
- puis rebuild. Tant que ce n'est pas synchro, **le login social casse**. À faire en une passe dédiée.

### 2. App Store Connect (prod)
- Créer l'app record **prod** avec le bundle `paris.panger.app` + nom « Panger ».
- Enregistrer l'App ID sur le compte Apple (EAS le gère au premier `eas build --profile production`).
- Renseigner la fiche : nom, sous-titre, Privacy Policy URL = `https://<domaine>/confidentialite`, Support URL.

### 3. Slug EAS / projet Expo
- `slug` reste **`ping-pang-paris`** (identité EAS liée au `projectId 866c2335-…`). Le renommer n'est pas nécessaire et risque de désaligner le projet EAS — **laisser tel quel** sauf besoin explicite.

### 4. Assets / icônes (designer)
- Icône app, splash, adaptive icon Android, favicon → wordmark **Panger** (actuellement « Ping Pang »).
- Fichiers : `assets/images/icon.png`, `splash-icon.png`, `android-icon-*`, `favicon.png`.
- À caler avec le **Figma** (design non figé, cf. vision.md) — ne pas sur-investir avant.

### 5. Cloudflare Pages (app web PWA)
- Le projet Pages de l'app web s'appelle `ping-pang-paris` (script `deploy:web`). Optionnel : créer un projet `panger` et brancher le domaine. Sans impact fonctionnel.

### 6. Divers
- Reste des « Ping Pang » = **commentaires de code** + `map-style.ts` (`name: 'Ping Pang'` = identifiant interne de style MapLibre, non visible) → cosmétique, non urgent.
- Domaine : acheter/brancher le domaine **Panger** (landing + redirect URLs OAuth + Privacy URL en dépendent).
- Emails : `admin@pingpang.paris` reste valide ; prévoir un `contact@<domaine-panger>` pour les mentions légales.
