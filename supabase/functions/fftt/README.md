# Edge Function `fftt` — lookup joueurs FFTT

Expose à l'app Expo la **recherche**, la **fiche détaillée** (profil + matchs),
l'**historique de classement** et les **adversaires communs** d'un licencié FFTT,
en JSON propre.

## Backend : API PingPocket (sans CAPTCHA)

La fonction interroge l'**API JSON publique de PingPocket**
(`https://www.pingpocket.fr/app/fftt/api/…`) — cf. [`pingpocket.ts`](./pingpocket.ts).
C'est une API **stateless** : **aucun cookie, aucun CAPTCHA, aucun `PHPSESSID`** à
entretenir. Solution **temporaire en attendant l'accès officiel SMARTPING**.

```text
┌─────────────┐  invoke('fftt')  ┌──────────────────┐   GET JSON    ┌──────────────────────────┐
│  App Expo   │ ───────────────▶ │  Edge Function   │ ────────────▶ │ pingpocket.fr            │
│ (client SB) │ ◀──── JSON ───── │  fftt (Deno)     │ ◀─── JSON ─── │ /app/fftt/api/licensees  │
└─────────────┘                  └───────┬──────────┘               └──────────────────────────┘
                                         │ upsert (cache + miroir)
                                         ▼
                            ┌──────────────────────────────────┐
                            │ fftt_cache · fftt_players ·        │
                            │ fftt_matches (idempotent match_uid)│
                            └──────────────────────────────────┘
```

- **Même contrat de types** que l'ancien scraper (`FfttPlayer` / `FfttPlayerDetail`
  dans [`fftt.ts`](./fftt.ts)) → **drop-in**, l'app est inchangée.
- **Persistance** : `action=player` upsert le profil dans `fftt_players` et les matchs
  dans `fftt_matches` (clé naturelle idempotente `match_uid`, cf. migration `0020`) →
  c'est ce miroir que lit le feed / le profil, sans re-scraper.
- **Rate limit** : PingPocket répond `429` si on tape trop vite (l'IP sortante est
  partagée par tous les users). `pingpocket.ts` retry/backoff (700 ms, 1.5 s), puis la
  fonction renvoie **503 `rate_limited`** → l'appelant s'appuie sur le cache.

> **Legacy** : l'ancien scraper `www2.fftt.com` (CAPTCHA 4 chiffres + `PHPSESSID` +
> OCR tesseract) reste dans [`fftt.ts`](./fftt.ts) comme **repli**. Pour y revenir,
> réimporter `searchFftt` / `getDetailFftt` depuis `./fftt.ts` dans `index.ts`. Tant
> que PingPocket est actif, la table `fftt_session` et le script `refresh-session`
> (`scripts/fftt/`) sont **dormants**.

## Tables

| Table | Rôle |
|---|---|
| `fftt_cache` | Cache des réponses (`cache_key` → `payload` jsonb), TTL appliqué côté fonction. |
| `fftt_players` / `fftt_matches` | Miroir persistant (upsert idempotent) alimenté à chaque `action=player`. |
| `fftt_session` | **Dormant** — utile uniquement pour le repli www2.fftt.com. |

RLS activée sans policy (accès `service_role` uniquement) pour `fftt_cache`/`fftt_session` ;
`fftt_players`/`fftt_matches` sont en lecture publique (miroir affiché dans l'app).

## Endpoints

`GET` (query string) **ou** `POST` (corps JSON) — compatible `supabase.functions.invoke`.

| Action | Params clés | Réponse |
|---|---|---|
| `search` | `nom`/`prenom` **ou** `licence`, `limit` | `{ players: FfttPlayer[], cached? }` |
| `player` | `numberId` (= n° de licence) | `{ player: FfttPlayerDetail, cached? }` |
| `history` | `numberId` | `{ history: { date, points, nationalRanking }[] }` — tendance long terme |
| `common` | 2 licences | adversaires communs entre 2 joueurs (head-to-head) |

Formats `FfttPlayer` / `FfttPlayerDetail` : voir [`fftt.ts`](./fftt.ts). Les 4 actions
sont servies par PingPocket (JSON, sans CAPTCHA).

## Cache & TTL

Réponses mises en cache dans `fftt_cache` : `search` **1 h**, `player` **6 h**,
`history` **24 h**, `common` **6 h** (constantes `TTL` dans [`index.ts`](./index.ts)).
Un hit renvoie `"cached": true`.

## Déploiement

```bash
supabase functions deploy fftt
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont **injectés automatiquement** dans les
Edge Functions. **Aucune session à alimenter** (PingPocket est stateless) — plus de cron
`refresh-session` tant qu'on reste sur PingPocket.

## Appel depuis l'app Expo

```ts
import { supabase } from '@/lib/supabase/client';

// Recherche (onboarding « trouve ton classement »)
const { data } = await supabase.functions.invoke('fftt', {
  body: { action: 'search', nom: 'GHEERAERT', prenom: 'Paul' },
});
// data.players → [{ numberId, pointsOfficiels, club, … }]

// Fiche détaillée (profil + matchs → alimente fftt_matches)
const { data: d } = await supabase.functions.invoke('fftt', {
  body: { action: 'player', numberId: '7519477' },
});
// d.player.matchs → historique
```

Gérer le cas **503 `rate_limited`** (PingPocket throttle) : afficher les données en
cache et réessayer plus tard — surtout **ne pas marteler**.

### curl (debug)

```bash
curl "https://YOUR-PROJECT.supabase.co/functions/v1/fftt?action=search&nom=GHEERAERT" \
  -H "Authorization: Bearer YOUR-ANON-KEY"

curl "https://YOUR-PROJECT.supabase.co/functions/v1/fftt?action=player&numberId=7519477" \
  -H "Authorization: Bearer YOUR-ANON-KEY"
```

## Limites

- Dépend de **PingPocket** (API non officielle, non contractuelle) → **temporaire, à
  migrer vers SMARTPING** (l'API officielle FFTT) dès l'accès obtenu.
- **Rate limit 429 partagé par IP** (tous les users passent par l'IP de l'Edge Function)
  → le cache `fftt_cache` est indispensable ; ne pas synchroniser en rafale.
- L'API JSON n'expose **pas** la lettre de classement ni le rang national de l'adversaire
  (seulement les points) → ces champs restent `null`.
