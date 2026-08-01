# 🏓 Ping Pang Paris — Architecture

> Document technique de référence. Cadre les principes d'archi, les environnements
> (dev / staging / prod), et les plans transverses (recherche, analytics).
> Complète [`../vision.md`](../vision.md) (le *quoi*/*pourquoi*) — ici c'est le *comment*.
>
> Langue de travail : **français**. Principe directeur : **vélocité, mais une base de prod propre.**
> _Dernière mise à jour : 2026-08-01._

---

## 0. TL;DR — les 6 règles

1. **Postgres (Supabase) = seule source de vérité.** Tout le reste (recherche, analytics, cache) est *dérivé* et reconstructible.
2. **Le client ne fait jamais autorité.** ELO, scores, validation match, statut premium, events « argent » → calculés/validés **côté serveur** (Edge Functions), jamais depuis le téléphone.
3. **Les Edge Functions Supabase SONT le backend (BFF).** Pas de microservices, pas d'ECS, pas de serveur NestJS. La logique métier vit là, pas dans l'app.
4. **2 environnements isolés** (right-sized solo) : **`staging` + `prod`** = 2 projets Supabase distincts. La règle qui compte : **une base jetable (staging) et une base sacrée (prod) — la beta TestFlight ne touche JAMAIS la prod.**
5. **Analytics découplé** : l'app émet des events métier, PostHog consomme. L'UI ne connaît pas la logique analytics.
6. **Une DB, des schémas — pas de split prématuré.** On ne découpe en services que sous une douleur réelle et mesurée.

> Ces règles sont les principes de séparation de l'archi The Bradery (`bifrost`), *right-sized* pour un
> produit early-stage. On vole leurs principes, **pas** leur stack entreprise (microservices/ECS/Cognito/EventBridge).

---

## 1. Vue d'ensemble

```
┌─────────────────────────── EXPO APP (client) ───────────────────────────┐
│  supabase-js .......... auth · realtime · reads directs (via RLS)        │
│  TanStack Query ....... server-state / cache                             │
│  PostHog RN ........... events · feature flags · A/B · session replay    │
│  → appelle les Edge Functions pour tout ce qui est privilégié/sensible   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
┌──────────────── SUPABASE (backend managé = notre "BFF") ─────────────────┐
│  Postgres = SOURCE DE VÉRITÉ + Row Level Security                        │
│    ├─ FTS (tsvector + pg_trgm) ....... recherche joueurs / events        │
│    └─ PostGIS ......................... carte tables / clubs (géo)        │
│  Auth (Google / Apple / email)                                           │
│  Realtime ............................. feed, classement live            │
│  Storage .............................. avatars, médias                  │
│  Edge Functions (Deno) = domain logic :                                  │
│    elo/glicko · validation match · fftt import · podplay cron            │
│    · stripe webhooks · push · → events server-side vers PostHog          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ (async, découplé)
┌───────────────────────── PLAN ANALYTICS / GROWTH ────────────────────────┐
│  PostHog : funnels · rétention · feature flags · A/B · surveys · replay  │
└──────────────────────────────────────────────────────────────────────────┘

   Plus tard, seulement sous besoin réel :
   • Meilisearch/Typesense managé (index synchronisé depuis Postgres)
   • Export PostHog → warehouse (quand il y a une équipe/besoin data)
```

**Ce qu'on N'ajoute PAS** (pièges d'over-engineering issus de la lecture de `bifrost`) :
microservices, ECS Fargate, monorepo Turborepo de services, AWS Cognito (Supabase Auth suffit),
EventBridge (triggers Postgres + `pg_net` + PostHog suffisent), warehouse BigQuery dédié (PostHog couvre le produit),
Elasticsearch (voir §4).

---

## 2. Environnements — le chantier prioritaire

### 2.1 État actuel (à corriger)

- **UN seul projet Supabase** (`djwlpgvmmxmfbkvqbbyj`) partagé par : dev local (`.env`), beta TestFlight (`eas.json` profil `beta` qui `extends production`) **et** la future prod.
- Conséquence : **la beta écrit dans la base de prod.** Toute donnée de test, tout schéma cassé, tout compte bidon pollue la prod. Impossible de reset, impossible de tester une migration sans risque.

### 2.2 Cible — 2 environnements isolés

> Décision : **2 projets Supabase suffisent** à ce stade (solo, beta TestFlight, lancement septembre).
> Passer à 3 (ajouter un `dev` cloud dédié) seulement plus tard, sous besoin réel (users payants en prod +
> migrations risquées à tester sur volume prod). Le nombre importe peu — l'invariant, c'est : **1 base jetable, 1 base sacrée.**

| Env | Usage | Projet Supabase | Projet PostHog | Build Expo |
|---|---|---|---|---|
| **staging** | dev local **+** beta TestFlight **+** testeurs/QA + review fondateur. Données jetables, resettable. | **`ytcnlidttxzvbpeosmhx`** (nouveau, vide) | `PPP staging` | dev client / profil EAS `development` · `preview` · `beta` |
| **prod** | utilisateurs réels, lancement public uniquement | **`djwlpgvmmxmfbkvqbbyj`** (le projet d'origine, déjà configuré : auth/storage/cron) | `PPP prod` | profil EAS `production` |

> Choix walid (01/08) : **le projet d'origine = PROD** (il est déjà tout configuré → zéro bring-up), **le nouveau = STAGING** (vide, jetable).
> ⚠️ **Contrepartie** : la prod porte les données de beta/test accumulées sur TestFlight. **À nettoyer avant le lancement public** (supprimer comptes/matchs de test), ou reset ciblé.

- **Dev local** : `.env` pointe sur **staging** (`ytcnlidttxzvbpeosmhx`). Ne JAMAIS mettre les creds prod dans `.env`. Alternative : Supabase local jetable (`supabase start`, Docker).
- **Règle** : la beta TestFlight = **staging**, jamais prod. Les vrais users n'arrivent qu'au lancement sur `prod`.
- **Ordre à respecter** : pousser les migrations sur staging (vide) **avant** de shipper la prochaine build beta, sinon les testeurs tombent sur une base sans schéma.
- Coût : staging peut rester en free tier, prod en Pro. (Cf. The Bradery : environnements isolés + base prod protégée — ici *right-sized* à 2.)

### 2.3 Config & secrets

- Variables **client** : préfixe `EXPO_PUBLIC_` obligatoire, injectées par **profil EAS** (`eas.json`), une valeur par env.
  Ne mettre en `EXPO_PUBLIC_` **que du non-secret** (URL Supabase, clé *anon*, clé PostHog projet, clé Giphy).
- Variables **serveur / secrets réels** (`service_role`, secret Stripe, clés FFTT, `POSTHOG_PERSONAL_API_KEY`) :
  **jamais** dans le repo ni en `EXPO_PUBLIC_`. Elles vivent dans les **secrets des Edge Functions Supabase**
  (`supabase secrets set`), une valeur par projet.
- Cible d'outillage secrets : un gestionnaire type **Infisical** (3 envs) si le besoin grandit — pas indispensable au début,
  les secrets EAS + Supabase suffisent tant qu'on est solo.

```jsonc
// eas.json — 2 envs : development+preview/beta → staging, production → prod
"development": { "env": { "EXPO_PUBLIC_SUPABASE_URL": "https://djwlpgvmmxmfbkvqbbyj.supabase.co", "EXPO_PUBLIC_POSTHOG_KEY": "phc_staging..." } },
"preview":     { "env": { "EXPO_PUBLIC_SUPABASE_URL": "https://djwlpgvmmxmfbkvqbbyj.supabase.co", "EXPO_PUBLIC_POSTHOG_KEY": "phc_staging..." } },
"beta":        { "extends": "preview" },
"production":  { "env": { "EXPO_PUBLIC_SUPABASE_URL": "https://ppp-prod.supabase.co",              "EXPO_PUBLIC_POSTHOG_KEY": "phc_prod..." } }
```

> ⚠️ Actuellement `beta` `extends production` et hardcode l'URL de l'unique projet → **c'est ce qui fait écrire la beta en (future) prod.**
> La correction ci-dessus fait pointer `beta` sur **staging**.

### 2.4 Flux de migrations (discipline DB)

Le schéma vit **uniquement** dans `supabase/migrations/` (déjà le cas, 24 migrations). Aucune modif de schéma « à la main » dans le dashboard prod.

```
écrire migration en local  →  supabase db reset (local Docker)  →  push staging  →  QA beta  →  (au lancement) push prod
```

- `supabase db push` cible le projet **lié** (`supabase link --project-ref ...`) → toujours vérifier lequel avant un push.
- **Prod = read-only à la main.** On ne modifie prod que par migration versionnée + une PR. (Cf. Bradery : `prod-write-allowlist`.)
- Prévoir un script de **seed** dev/staging (données de démo joueurs/matchs) pour tester sans polluer.

---

## 3. Couches applicatives

### 3.1 Client (Expo)
- **Expo Router** (file-based), TypeScript strict, **NativeWind**, TanStack Query pour le server-state (déjà en place).
- **Tokens de thème centralisés** (`theme/`) — 1 seul endroit à re-skinner quand le Figma arrive. Aucun hex/police en dur dans les écrans.
- L'app **lit** Postgres directement via supabase-js (protégé par RLS) et **écrit** via Edge Functions dès qu'il y a une règle métier.

### 3.2 Backend = Supabase (le « BFF »)
- **Edge Functions (Deno)** = toute la logique qui ne doit pas être dans le client :
  `elo`/`glicko`, validation de match (les 2 joueurs), import FFTT, sync Podplay (cron), webhooks Stripe, envoi push,
  et l'émission des **events analytics de confiance** vers PostHog (server-side).
- **RLS activé partout** : chaque table a ses policies. Le client n'accède qu'à ce que la policy autorise.
  La clé `service_role` (qui bypass RLS) **ne quitte jamais** les Edge Functions.

### 3.3 Règle d'anti-triche (déjà amorcée)
`0010_match_confirmation` = match validé par les 2 joueurs. On généralise : **rien qui affecte le classement, l'argent ou
les stats ne peut être écrit unilatéralement par un client.** Le serveur recalcule et valide.

---

## 4. Plan recherche

> Décision V1 : **Postgres FTS + PostGIS, dans Supabase, zéro infra en plus.**
> **Pas d'Elasticsearch.** ES = cluster JVM à opérer/payer (~95 $/mois plancher) pour un besoin que Postgres couvre à notre échelle.
> La leçon Bradery n'est pas « prends Elastic », c'est « aie un index de recherche *dérivé* de la DB ».

| Besoin | Solution | Techno |
|---|---|---|
| Recherche joueurs (nom, défis/follow) | full-text + fuzzy | `tsvector` + `pg_trgm` |
| Carte tables / clubs | géo (rayon, proximité) | **PostGIS** (`earthdistance`/`ll_to_earth` ou `geography`) |
| Events, FFTT | full-text | `tsvector` |

**Pattern de sync (à garder prêt)** : la recherche est *dérivée*. Colonne `search_vector` maintenue par trigger sur write.
Si un jour la recherche instantanée devient un vrai argument produit → on migre vers **Meilisearch/Typesense managé**
(pas Elastic) via `trigger Postgres → pg_net → Edge Function → index`. Le reste de l'app ne bouge pas.

---

## 5. Plan analytics — PostHog

> PostHog = 4 outils en 1 : **product analytics + feature flags + A/B + session replay + surveys.**
> Remplace à lui seul le combo Heap+Adjust+Firebase+AB Tasty+Flagship de Bradery. Meilleur ratio pour un early-stage.

### 5.1 Intégration
- SDK `posthog-react-native` dans un `PostHogProvider` racine, clé **par env** (§2.3).
- **Autocapture limité en RN** → on trace **peu d'events mais nets**, à la main. Screen views via listener `expo-router`.
- `identify()` au login avec l'**ID Supabase** du joueur → relie replay + funnels à une personne.
- **Reverse-proxy** PostHog (domaine custom / Edge Function) pour la fiabilité réseau mobile.

### 5.2 Events de confiance = server-side
Les events qui alimentent les funnels critiques ou touchent à l'argent partent des **Edge Functions** (`posthog-node`),
pas du client (sinon funnels faussés + spoofables) :
`match_recorded`, `elo_changed`, `elo_tier_up`, `challenge_sent`, `challenge_accepted`, `fftt_imported`,
`premium_subscribed`, `premium_churned`.
Events purement UI (navigation, `paywall_viewed`, `onboarding_step`) → OK côté client.

### 5.3 Feature flags = rampe de lancement
Les flags PostHog pilotent la progression **beta fermée club → beta ouverte → public** (roadmap V1) et le **gating Premium**.
Un flag = un interrupteur serveur, pas un build à republier.

---

## 6. Intégrations externes

| Intégration | Rôle | Où vit la logique |
|---|---|---|
| **FFTT** | import classement officiel (mission 01) | Edge Function `fftt` / `fftt-refresh` |
| **Podplay** | sync events Ping Pang Paris | Edge Function cron (`0008_podplay_cron`) |
| **pingpongmap.net** | tables/clubs pour la carte | script d'ingestion → Postgres/PostGIS |
| **Stripe** | abonnement Premium | Edge Function `stripe-webhook` (source de vérité du statut premium) |
| **Push (APNs / Expo)** | notifications natives | Edge Function `push-send` (déjà là) |

Principe : chaque intégration entre/sort **par une Edge Function**, jamais en direct depuis le client.
Le statut premium est écrit **par le webhook Stripe**, jamais déclaré par l'app.

---

## 7. Structure du repo (cible)

```
ping-pang-app/
├── src/
│   ├── app/                 # Expo Router : (auth) · (tabs: feed/classement/jouer/carte/profil)
│   ├── components/          # composants thémés (Button, Card, Pill, TabBar…)
│   ├── constants/ · hooks/
│   └── lib/                 # 1 dossier par domaine (déjà le cas) :
│       ├── supabase/        # client + queries (client par env)
│       ├── elo/ · matches/ · players/ · training/ · tournaments/
│       ├── feed/ · social/ · venues/ · slots/ · location/
│       ├── fftt/ · podplay/ · push/
│       ├── query/           # config TanStack Query
│       └── analytics/       # ← À CRÉER : wrapper PostHog + events typés
├── theme/                   # tokens centralisés (couleurs/typo/spacing)
├── supabase/
│   ├── migrations/          # schéma SQL versionné (seule source du schéma)
│   └── functions/           # edge functions (fftt, push-send, stripe-webhook, …)
├── eas.json                 # profils dev/preview/production (1 env chacun)
└── ARCHITECTURE.md          # ce document
```

---

## 8. Chantier « vrai environnement de prod » — ordre d'exécution

- [x] **1. Projets** ✅ (01/08) : **prod = `djwlpgvmmxmfbkvqbbyj`** (origine), **staging = `ytcnlidttxzvbpeosmhx`** (nouveau, vide). 2 projets.
- [ ] **2. Pousser les migrations sur STAGING** (`ytcnlidttxzvbpeosmhx`, vide) via `supabase db push`. La prod (origine) a déjà le schéma. **Faire ça AVANT la prochaine build beta.**
- [x] **3. Câbler les env EAS** ✅ (01/08) : `eas.json` → `development`/`preview`/`beta` sur staging (`ytcnlidttxzvbpeosmhx`), `production` sur prod (`djwlpgvmmxmfbkvqbbyj`). `beta` = distribution `store` (TestFlight OK). `.env` local → staging.
- [x] **4. Beta TestFlight pointe sur staging** ✅ (via étape 3) — ne touche plus jamais prod.
- [ ] **4bis. Nettoyer les données de test dans PROD** avant lancement public (comptes/matchs de beta).
- [x] **5. Couche analytics** ✅ (01/08) : `src/lib/analytics/` (events typés + sink découplé + identify/screen auto branchés dans `_layout`). No-op tant que PostHog absent. **Reste** : créer 2 projets PostHog (staging+prod), remplir `EXPO_PUBLIC_POSTHOG_KEY` par env, brancher le sink PostHog (1 fichier — cf. `src/lib/analytics/README.md`).
- [ ] **6. Déplacer les secrets serveur** hors du repo → secrets Edge Functions par env (`service_role`, Stripe, FFTT).
- [ ] **7. Script de seed** dev/staging (joueurs/matchs de démo) pour tester sans polluer.
- [ ] **8. Discipline prod** : prod modifiable uniquement par migration + PR (pas de main-à-la-DB).

---

## 9. Décisions ouvertes / à trancher

- [ ] **ELO vs Glicko-2 en V1** — le repo a déjà `0013_glicko`. Confirmer : Glicko-2 partout, ou ELO simple affiché + Glicko interne ?
- [ ] **Réutilisation du reverse-proxy PostHog** — Edge Function dédiée vs domaine custom.
- [ ] **Migration data dev→prod au lancement** — probablement **repartir d'une base prod vide** (les comptes beta restent en staging).
- [ ] **Gestionnaire de secrets** — rester sur secrets EAS+Supabase, ou passer à Infisical quand ça grossit.
- [ ] **CI/CD** — GitHub Actions : lint + typecheck + tests (Vitest/Playwright déjà présents) + `eas build` sur tag.
```
