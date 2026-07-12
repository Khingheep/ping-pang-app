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
  script de provisioning cree/confirme via l'API admin **deux** comptes onboardes,
  `e2e-runner` (pilote) et `e2e-peer` (destinataire des messages / futur adversaire),
  et remet le pilote a plat (objectif `null`, seances / creneaux / tournois / messages vides).
- La PWA cible doit contenir le code a tester (des `testID` sont poses dans l'app :
  `train-hero`, `hero-goal`, `goal-slider`, `goal-value`, `goal-save`). Deployer avant de tester.

## Architecture

| Fichier | Role |
| --- | --- |
| `playwright.config.ts` | 3 projets : `setup` (login) -> `authed` (tests connectes) ; `anon` (sans session) |
| `e2e/creds.ts` | identifiants + URL (surcharge par env) |
| `e2e/provision.mjs` | cree le compte de test (API admin) + vide ses seances, idempotent |
| `e2e/admin.ts` | helpers service_role pour seeder/nettoyer (objectif, seances) cote test |
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
| **TC-05a** | Login : champs requis | Pas de session | `/login` -> "Se connecter" sans rien saisir | Alerte "Champs requis", on reste sur le login |
| **TC-05b** | Login : mauvais mot de passe | Pas de session | `/login` -> email valide + mauvais mot de passe | Alerte "Erreur", on reste sur le login |
| **TC-07** | Objectif atteint | Connecte, semaine seedee a 4h, cible 3h | Ouvrir `/train` | Le hero affiche "Objectif de la semaine atteint" |
| **TC-08** | Creer une seance (wizard) | Connecte, aucune seance | CTA "J'ai joué" -> choisir un coup -> Continuer x4 -> Enregistrer | Retour sur Train, l'etat vide disparait, la seance apparait, et +1 en base |
| **TC-09** | Ecrans secondaires | Connecte | Deep-link `/mes-seances`, `/mes-tournois`, `/notifications`, `/profile`, `/settings` | Chaque ecran rend son contenu |
| **TC-10** | Deconnexion | Connecte | `/settings` -> "Se déconnecter" | Session videe -> retour a l'ecran welcome |
| **TC-11** | Creer un tournoi | Connecte | `/tournoi-new` -> nom -> "Créer le tournoi" | Redirection vers l'ecran du tournoi (nom affiche), +1 en base |
| **TC-12** | Envoyer un message | Connecte | `/chat` avec le compte pair -> taper -> Entree | Le message apparait dans le fil |
| **TC-13** | Proposer un creneau | Connecte | `/new-slot` avec un lieu -> jour futur -> "Publier le créneau" | Alerte "Créneau publié", +1 creneau en base |

### Connexion (setup)

Pre-requis de tous les tests `authed`. Ouvre `/login`, saisit email + mot de passe du
compte de test, clique "Se connecter", attend l'arrivee dans les onglets, sauvegarde la
session. La session Supabase vit dans le `localStorage`, reutilisee ensuite sans re-login.

## Notes

- **1 worker, base prod** : les tests sont sequentiels pour ne pas marteler la base.
- **Idempotence** : TC-04 choisit une cible differente de la valeur courante ; le provisioning
  remet l'objectif a `null` et vide les seances a chaque `npm run e2e`.
- **Tests mutatifs** : TC-07/08 (seances), TC-11 (tournoi), TC-12 (message), TC-13 (creneau)
  ecrivent en base sur les SEULS comptes de test et nettoient derriere eux via
  `e2e/admin.ts` (service_role). Le provisioning re-nettoie aussi au debut de chaque run.
- **Artefacts** : traces + captures conservees a l'echec sous `test-results/`, rapport HTML
  sous `playwright-report/` (git-ignores).
- **Auth OTP** : en prod l'app est en OTP email ; l'ecran `/login` (email + mot de passe) reste
  branche et sert de porte d'entree testable via un mot de passe pose par l'API admin.
