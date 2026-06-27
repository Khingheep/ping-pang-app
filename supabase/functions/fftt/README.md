# Edge Function `fftt` — lookup joueurs FFTT

Expose la recherche et la fiche détaillée d'un licencié FFTT à l'app Expo, en
JSON propre. C'est la version serveur du scraper [`scripts/fftt/`](../../scripts/fftt/)
(dont la logique de parsing est portée ici, validée en live).

## Architecture (découplée)

L'app mobile ne peut pas scraper du HTML, et `www2.fftt.com` est protégé par un
CAPTCHA. On sépare donc en deux :

```text
┌─────────────┐   invoke('fftt')   ┌──────────────────┐   PHPSESSID    ┌────────────┐
│  App Expo   │ ─────────────────▶ │  Edge Function   │ ◀───lecture─── │ fftt_session│
│ (Supabase   │ ◀──── JSON ─────── │  fftt (Deno)     │                │  (Postgres) │
│  client)    │                    │  fetch + cheerio │ ───écriture──▶ │ fftt_cache  │
└─────────────┘                    └────────┬─────────┘                └─────▲──────┘
                                            │ HTTP (avec PHPSESSID)          │ upsert
                                            ▼                                │
                                   ┌──────────────────┐            ┌─────────┴────────┐
                                   │   www2.fftt.com  │            │  Script Node     │
                                   │  (API officielle)│            │ refresh-session  │
                                   └──────────────────┘            │ (OCR du CAPTCHA) │
                                                                   └──────────────────┘
```

- **Edge Function** (Deno, légère) : lit le `PHPSESSID` validé en base, interroge
  FFTT, parse, met en cache, renvoie du JSON. **Pas d'OCR** (cold start rapide, fiable).
- **Script Node `refresh-session`** : résout le CAPTCHA (tesseract) et **upload** le
  `PHPSESSID` validé dans `fftt_session`. Tourne en cron (ex. GitHub Actions).
- Si la session est morte (CAPTCHA réapparu), l'Edge Function renvoie **503
  `session_expired`** → relancer un refresh.

> Pourquoi ce découpage : l'OCR (tesseract.js / WASM) est lourd et peu fiable en
> Deno Deploy. On le garde côté Node où il marche, et la session validée (rare à
> renouveler) est partagée via la base.

## Tables (migration `0003_fftt_session.sql`)

| Table | Rôle |
|---|---|
| `fftt_session` | Singleton (`id=1`) : le `PHPSESSID` validé + `expires_at`. |
| `fftt_cache` | Cache des réponses (`cache_key` → `payload` jsonb), TTL appliqué côté fonction. |

Les deux ont la **RLS activée sans policy** → accessibles uniquement par la
`service_role` (l'Edge Function). Aucune exposition publique.

## Endpoints

`GET` (query string) **ou** `POST` (corps JSON) — les deux marchent, donc
compatible avec `supabase.functions.invoke`.

### `action=search`

| Param | Ex. | Défaut |
|---|---|---|
| `nom` / `prenom` | `LEBRUN` / `Felix` | |
| `licence` | `3421810` | |
| `club` / `nclub` | `MONTPELLIER TT` | |
| `sexe` | `Hommes` \| `Femmes` | les deux (fusionnés) |
| `type` | `cl` (tous) \| `off` (numérotés nat.) | `cl` |
| `limit` | `50` | `100` |

→ `{ "players": FfttPlayer[], "cached"?: true }`

### `action=player`

| Param | Ex. |
|---|---|
| `numberId` | `3421810` (= n° de licence) |

→ `{ "player": FfttPlayerDetail, "cached"?: true }`

Formats `FfttPlayer` / `FfttPlayerDetail` : voir [`fftt.ts`](./fftt.ts) et le
[README du scraper](../../scripts/fftt/README.md).

## Déploiement

```bash
# 1) Appliquer la migration (tables session + cache)
supabase db push

# 2) Déployer la fonction
supabase functions deploy fftt
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont **injectés automatiquement**
dans les Edge Functions — rien à configurer côté fonction.

## Alimenter / renouveler la session

La fonction est inerte tant que `fftt_session` est vide. Depuis le scraper Node :

```bash
cd scripts/fftt
cp .env.example .env          # renseigner SUPABASE_URL + SERVICE_ROLE_KEY
npm install
npm run fftt -- refresh-session
```

Ça résout le CAPTCHA et upload le `PHPSESSID` validé. À **automatiser en cron**
(la session FFTT expire après quelques heures). Exemple GitHub Actions :

```yaml
# .github/workflows/fftt-session.yml
name: Refresh FFTT session
on:
  schedule: [{ cron: '0 */4 * * *' }]   # toutes les 4 h
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - working-directory: ping-pang-app/scripts/fftt
        run: npm ci && npm run fftt -- refresh-session
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Appel depuis l'app Expo

```ts
import { supabase } from '@/lib/supabase/client';

// Recherche (onboarding « trouve ton classement »)
const { data } = await supabase.functions.invoke('fftt', {
  body: { action: 'search', nom: 'LEBRUN', prenom: 'Felix' },
});
// data.players → [{ numberId, pointsOfficiels, classementOfficiel, club, … }]

// Fiche détaillée (dashboard progression)
const { data: d } = await supabase.functions.invoke('fftt', {
  body: { action: 'player', numberId: '3421810' },
});
// d.player.matchs → historique pour les graphes
```

Gérer le cas **503 `session_expired`** : afficher un retry / déclencher un refresh.

### curl (debug)

```bash
curl "https://YOUR-PROJECT.supabase.co/functions/v1/fftt?action=search&nom=LEBRUN" \
  -H "Authorization: Bearer YOUR-ANON-KEY"

curl "https://YOUR-PROJECT.supabase.co/functions/v1/fftt?action=player&numberId=3421810" \
  -H "Authorization: Bearer YOUR-ANON-KEY"
```

## Cache & TTL

Réponses mises en cache dans `fftt_cache` : `search` 1 h, `player` 6 h (constantes
dans [`index.ts`](./index.ts)). Un hit renvoie `"cached": true`.

## Limites

- **Non testée localement** (pas de Deno/Supabase CLI dans l'env de dev) : la
  logique FFTT est un **port direct** du scraper Node validé en live ; à fumer-tester
  après le 1er `supabase functions deploy`.
- Dépend du HTML de `www2.fftt.com` (parsing dans `fftt.ts`).
- La session expire → cron de refresh indispensable en prod.
- `pointsMensuels`/évolutions buggés côté FFTT pour le top ~100 numéroté national
  (`pointsOfficiels` reste fiable).
