# Feuille de test e2e - Ping Pang Paris (PWA)

Tests de bout en bout avec **Playwright**, joues sur la **vraie PWA deployee** (Cloudflare Pages)
et la vraie base Supabase de prod. Ils n'utilisent qu'un **compte de test dedie**
(`e2e-runner@pingpang.test`) provisionne a la volee : aucun vrai utilisateur n'est touche.

## Comment lancer

```bash
# 1. Installer le navigateur (une seule fois)
npx playwright install chromium

# 2. Provisionner le compte de test + jouer toute la suite
npm run e2e

# Variantes utiles
npm run e2e:provision        # (re)creer le compte de test seul
npx playwright test          # rejouer sans re-provisionner
npx playwright test weekly   # un seul fichier
npx playwright test --headed # voir le navigateur
npm run e2e:report           # rapport HTML du dernier run
```

Cibler un autre environnement (ex. une preview) :

```bash
E2E_BASE_URL=https://<hash>.ping-pang-paris.pages.dev npx playwright test
```

## Pre-requis

- `scripts/fftt/.env` renseigne (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) : le
  script de provisioning cree/confirme le compte de test via l'API admin et le marque
  `onboarded`, objectif hebdo remis a `null` (baseline 3h).
- La PWA cible doit contenir le code a tester (des `testID` sont poses dans l'app :
  `train-hero`, `hero-goal`, `goal-slider`, `goal-value`, `goal-save`). Deployer avant de tester.

## Architecture

| Fichier | Role |
| --- | --- |
| `playwright.config.ts` | 3 projets : `setup` (login) -> `authed` (tests connectes) ; `anon` (sans session) |
| `e2e/creds.ts` | identifiants + URL (surcharge par env) |
| `e2e/provision.mjs` | cree le compte de test (API admin), idempotent |
| `e2e/tests/auth.setup.ts` | connexion + sauvegarde de session (`storageState`) |
| `e2e/tests/*.spec.ts` | scenarios (voir plus bas) |
| `e2e/tests/*.anon.spec.ts` | scenarios sans session |

## Scenarios

| ID | Scenario | Pre-condition | Etapes | Resultat attendu |
| --- | --- | --- | --- | --- |
| **TC-01** | Redirection welcome | Pas de session | Ouvrir `/` | Ecran d'accueil : "Créer un compte", "La communauté du ping-pong parisien.", "J'ai déjà un compte" |
| **TC-02** | Navigation tab bar | Connecte | Cliquer chaque onglet (Défis, Ranking, Accueil, Map, Train) | L'onglet clique passe `aria-selected=true` |
| **TC-03** | Rendu des ecrans | Connecte | Ouvrir `/jouer`, `/classement`, `/carte`, `/train` | Chaque ecran affiche son contenu (Défis / Ranking Mondial / Où jouer ? / hero Entrainement) |
| **TC-04** | Objectif hebdo configurable | Connecte | Ecran Entrainement -> taper le hero -> deplacer le slider -> Enregistrer -> recharger | La feuille s'ouvre, la valeur change, le hero se met a jour, et l'objectif **persiste** apres rechargement |

### Connexion (setup)

Pre-requis de tous les tests `authed`. Ouvre `/login`, saisit email + mot de passe du
compte de test, clique "Se connecter", attend l'arrivee dans les onglets, sauvegarde la
session. La session Supabase vit dans le `localStorage`, reutilisee ensuite sans re-login.

## Notes

- **1 worker, base prod** : les tests sont sequentiels pour ne pas marteler la base.
- **Idempotence** : TC-04 choisit une cible differente de la valeur courante ; le provisioning
  remet l'objectif a `null` a chaque `npm run e2e`.
- **Artefacts** : traces + captures conservees a l'echec sous `test-results/`, rapport HTML
  sous `playwright-report/` (git-ignores).
- **Auth OTP** : en prod l'app est en OTP email ; l'ecran `/login` (email + mot de passe) reste
  branche et sert de porte d'entree testable via un mot de passe pose par l'API admin.
