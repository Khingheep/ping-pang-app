# 🏓 Ping Pang Paris — App iOS (Expo)

App native (Expo / React Native) du club **Ping Pang Paris**. Classement ELO, défis 1v1,
suivi d'entraînement, carte des tables. Vision produit : [`../vision.md`](../vision.md).

> Repo : [github.com/Khingheep/ping-pang-app](https://github.com/Khingheep/ping-pang-app)
> La version web Next.js précédente est préservée sur la branche **`web-legacy`**.

## Démarrer

```bash
npm install
cp .env.example .env          # renseigne le projet Supabase
npm run ios                   # ou: npm start  (puis i / a / w)
```

> iOS nécessite un Mac (simulateur) ou l'app **Expo Go** sur iPhone (`npm start` → scan QR).

## Scripts

| Commande | Effet |
|---|---|
| `npm start` | Démarre le bundler Expo (Metro) |
| `npm run ios` / `android` / `web` | Ouvre sur la plateforme cible |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (expo lint) |

## Stack

- **Expo SDK 56** · React Native 0.85 · React 19 · TypeScript
- **Expo Router** (file-based, `src/app/`) — bottom-tabs : Feed / Rank / Jouer / Carte / Profil
- **Supabase** — auth, Postgres, realtime, storage (client : `src/lib/supabase/client.ts`)

## Structure

```
src/
├── app/
│   ├── _layout.tsx          # racine : chargement polices + splash + Stack
│   └── (tabs)/              # les 5 onglets
│       ├── _layout.tsx      # navigation bottom-tabs
│       ├── index.tsx        # Feed
│       ├── classement.tsx   # ELO Mondial / Paris
│       ├── jouer.tsx        # défi 1v1 / score / tournoi
│       ├── carte.tsx        # parties : club, créneaux ouverts, lieux
│       └── profil.tsx       # ELO, niveau, stats
├── components/              # ThemedText, Screen, Card…
├── constants/theme.ts       # ⭐ TOKENS DESIGN — source de vérité unique (Eugenia)
├── hooks/                   # color scheme, theme
└── lib/
    ├── elo/                 # calcul ELO + niveaux gamifiés
    └── supabase/            # client Supabase
assets/fonts/                # Open Sauce One + Two (TTF)
supabase/migrations/         # schéma SQL (0001_init.sql)
```

## Design — NON figé

Le style vit **uniquement** dans [`src/constants/theme.ts`](src/constants/theme.ts) (couleurs,
polices, espacements, rayons). Il implémente la fondation de marque **Eugenia** (Evergreen dark
mode + Open Sauce). **Dès que le designer livre le Figma**, on met à jour ce seul fichier pour
re-skinner toute l'app. Aucun hex ni police en dur dans les écrans.

## Base de données

Schéma initial : [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
(`players`, `matches`, `challenges`, `venues`, `follows`). À appliquer via
l'éditeur SQL Supabase ou `supabase db push`.
