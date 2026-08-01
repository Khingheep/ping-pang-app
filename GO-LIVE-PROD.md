# Go-live prod — checklist des tâches « comptes » (hors code)

Ce qui reste demande **tes accès** (Apple, Supabase dashboard, Cloudflare) — non automatisable.
Le reste (schéma, functions, cron, analytics, consentement) est fait côté code. Cf. `ARCHITECTURE.md`.

## ✅ Déjà fait (staging)
- 81 migrations poussées ; 3 Edge Functions déployées.
- **Storage buckets** : créés par migrations (0019/0024/0038) → présents sur staging.
- **Secrets Edge Functions** : les 3 fonctions n'utilisent que `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, **auto-injectés** par Supabase → **rien à setter**.
- **Cron** : `push-drain` (1/min) + `retention-daily` actifs et pointant vers **staging** (fix `0080`/`0081`, table `app_config` + `functions_base_url()` = 'https://ytcnlidttxzvbpeosmhx.supabase.co'). Cron `podplay-events-daily` retiré (obsolète depuis 0045).
- **Consentement RGPD analytics** : opt-in strict codé (rien ne part sans acceptation).

## ⚠️ Rollout PROD du fix cron (`0080` + `0081`) — coordonné
Les migrations `0080`/`0081` ne sont **pas encore sur prod** (elles y sont inertes tant que la
valeur n'est pas définie). Au prochain déploiement prod :
```bash
supabase link --project-ref djwlpgvmmxmfbkvqbbyj   # PROD
supabase db push                                    # applique 0080 + 0081
supabase db query --linked "insert into public.app_config(key,value) values \
  ('functions_base_url','https://djwlpgvmmxmfbkvqbbyj.supabase.co') \
  on conflict (key) do update set value = excluded.value, updated_at = now();"
supabase link --project-ref ytcnlidttxzvbpeosmhx   # RE-lier staging (dev quotidien)
```
> ⚠️ **Push `0080`/`0081` ET définir la valeur dans la même passe** : sinon `functions_base_url()`
> renvoie NULL et le push notif de prod devient inerte.

## 1. Push notifications (APNs) — Apple + EAS
- Créer/laisser EAS gérer une **clé APNs** (`.p8`) sur ton compte Apple Developer.
- `eas credentials` (plateforme iOS) → configurer la Push Key pour le bundle **`paris.panger.app`**.
- Vérifier l'entitlement `aps-environment` (EAS l'ajoute au build). Tester sur un **dev build** (le push distant ne marche pas sur Expo Go).

## 2. Auth providers sur STAGING (projet neuf)
Dashboard Supabase → projet **panger-staging** → Authentication :
- **Google** : activer, coller Client ID + Secret (console Google Cloud), ajouter les **Redirect URLs** du scheme app (`pingpangparis://…`).
- **Apple** : activer Sign in with Apple, Service ID + clé.
- **URL Configuration** : ajouter les redirect URLs (deep link app + web si besoin).
> Le scheme reste `pingpangparis` pour l'instant (cf. `RENAME-PANGER.md` §1) — ne pas le changer sans mettre à jour ces redirect URLs en même temps.

## 3. App Store Connect — App Privacy (« nutrition labels »)
À déclarer à la soumission (basé sur l'archi réelle) :

| Donnée | Collectée ? | Liée à l'identité | Tracking | Finalité |
|---|---|---|---|---|
| Email / compte | Oui | Oui | Non | Fonctionnement de l'app, auth |
| Nom / photo profil | Oui | Oui | Non | Fonctionnement de l'app |
| Localisation (approx.) | Oui (opt-in) | Oui | Non | Carte des tables/joueurs proches |
| Contenu utilisateur (matchs, messages) | Oui | Oui | Non | Fonctionnement de l'app |
| Identifiants (user id) | Oui | Oui | Non | Fonctionnement de l'app |
| **Données d'usage / analytics** (PostHog) | Oui (**après consentement**) | Oui | Non* | Mesure d'audience, amélioration |
| Diagnostics / crash | Oui | Non | Non | Stabilité |

\* Non déclaré comme « Tracking » au sens ATT tant qu'on ne croise pas avec des données tierces à
des fins publicitaires. PostHog en instance **EU**, opt-in → pas de prompt ATT nécessaire a priori.
Si un jour tracking cross-app pub → activer App Tracking Transparency.

- **Privacy Policy URL** : `https://<domaine-panger>/confidentialite` (landing déjà en ligne).
- **Support URL** : page contact de la landing.

## 4. Divers avant public
- Remplir les placeholders légaux de la landing (`panger-landing/`), brancher le domaine Panger.
- Nettoyer les **données de test dans PROD** (comptes/matchs de beta).
- Créer les **2 projets PostHog** (staging/prod, région EU) + renseigner `EXPO_PUBLIC_POSTHOG_KEY` par env, puis brancher le sink (1 fichier, cf. `src/lib/analytics/README.md`).
- Ajouter la **bannière de consentement** analytics dans l'UI (hook `useAnalyticsConsent`, ex. après l'onboarding).
