# Scraper FFTT — lookup joueurs (mission 01)

> ⚠️ **LEGACY / repli.** Ce scraper `www2.fftt.com` (CAPTCHA 4 chiffres + `PHPSESSID`
> + OCR tesseract) **n'est plus le chemin actif.** L'Edge Function `fftt` interroge
> désormais l'**API JSON PingPocket** (stateless, **sans CAPTCHA**) — cf.
> [`supabase/functions/fftt/README.md`](../../supabase/functions/fftt/README.md) et
> `pingpocket.ts`. Objectif à terme : l'**API officielle SMARTPING**. On garde ce
> code + la tâche `refresh-session` comme **repli** si PingPocket tombe.

Recherche de licenciés FFTT par **nom / prénom / licence / club**, avec leur
classement officiel. Source : l'API AJAX du site officiel `www2.fftt.com`
(la même que l'app mobile FFTT). Renvoie du JSON propre et typé.

> Projet Node **autonome** (son propre `package.json`), volontairement hors du
> bundle Expo. Cible d'évolution : une Edge Function Supabase appelée par l'app.

## Comment ça marche

`www2.fftt.com` protège ses pages par un **CAPTCHA** (4 chiffres). La parade :

1. On obtient un cookie `PHPSESSID`.
2. On télécharge l'image du CAPTCHA et on la lit par OCR (`tesseract.js`,
   whitelist chiffres). On retente tant que la validation échoue.
3. Une fois le CAPTCHA passé **une seule fois**, ce `PHPSESSID` est « validé »
   et débloque l'endpoint de recherche jusqu'à expiration de la session.
4. Le `PHPSESSID` validé est **mis en cache** (`.fftt-session.json`) et réutilisé
   aux exécutions suivantes — plus de CAPTCHA tant que la session vit.

L'endpoint réel :
`POST /site/ajax1?plugins_controller=personsRemoteClassement&plugins_action=plugin_index_ajax`
→ renvoie une liste HTML de joueurs, qu'on parse avec `cheerio`.

## Installation

```bash
cd ping-pang-app/scripts/fftt
npm install
```

> Au tout premier lancement, `tesseract.js` télécharge ~2 Mo de données de
> langue (`eng`), puis les met en cache.

## Utilisation (CLI)

```bash
npm run fftt -- search LEBRUN                       # par nom (positionnel)
npm run fftt -- search --nom LEBRUN --prenom Felix
npm run fftt -- search --licence 3421810           # par numéro de licence
npm run fftt -- search --nom PAVADE                 # H + F fusionnés
npm run fftt -- search --nom POULAIN --sexe Hommes --json
npm run fftt -- search --nom LEBRUN --fresh         # ignore le cache, re-résout le CAPTCHA

npm run fftt -- player 3421810                      # fiche détaillée + matchs
npm run fftt -- player 3421810 --json
```

Options `search` : `--nom --prenom --licence --club --nclub --sexe Hommes|Femmes`
`--type cl|off --limit N --json --fresh`.
Options `player` : `<numberId>` (positionnel) `--json --fresh`.

- `--sexe` est requis côté FFTT ; si omis, on interroge **Hommes puis Femmes** et
  on fusionne (dé-doublonnage par `numberId`).
- `--type cl` (défaut) = **tous les licenciés**. `--type off` = uniquement les
  **numérotés nationaux** (~top 1700).

## API programmatique

```ts
import { FfttClient } from './src/client.ts';

const client = await FfttClient.create();          // session + CAPTCHA gérés
const joueurs = await client.search({ nom: 'LEBRUN', prenom: 'Felix' });
// → [{ numberId: '3421810', nom: 'LEBRUN', prenom: 'Felix',
//      rangNational: 1, pointsOfficiels: 4523, classementOfficiel: 'N1',
//      categorie: 'S', club: { numberId: '11340010', nom: 'MONTPELLIER TT' }, … }]

const fiche = await client.getDetail('3421810');   // profil + historique des matchs
// → { numberId, classementMensuel: 'N1', pointsOfficiels: 4523,
//     partiesDisputees: 6, pctVictoires: 100, evolutionMois, evolutionAnnee,
//     matchs: [{ date: '26/01/26', victoire: true,
//                adversaire: { numberId: '5625760', nom: 'KATSMAN Lev', classement: 'N26' },
//                journee: 13, coefficient: 2, gainPerte: 0 }, … ] }
```

> Le `numberId` de l'adversaire permet de **chaîner** vers sa fiche (head-to-head,
> lookup d'adversaire).

## Champs renvoyés (`FfttPlayer`)

| Champ | Ex. | Note |
|---|---|---|
| `numberId` | `"3421810"` | ID FFTT du joueur (clé stable) |
| `nom` / `prenom` | `LEBRUN` / `Felix` | |
| `pointsOfficiels` | `4523` | **valeur de force canonique** |
| `classementOfficiel` | `"N1"` / `"17"` / `"5"` | échelle FFTT (string ; `N…` = numéroté national) |
| `pointsMensuels` | `1717.8` | points glissants (`null` pour certains numérotés) |
| `rangNational` | `1` | |
| `categorie` | `S`, `V40`, `J18` | catégorie d'âge |
| `club` | `{ numberId, nom }` | |
| `sexe` | `H` / `F` | déduit du filtre |

## Fiche détaillée (`getDetail` / `player`)

Deux requêtes enchaînées : `GET by-number` (widgets profil + `pagination_key` du
plugin matchs, **régénéré à chaque chargement**) puis `POST personsRemoteGames`
(historique des matchs, avec `pagination-order=date DESC` — sinon erreur SQL 500).

| Champ profil | Ex. | Note |
|---|---|---|
| `classementMensuel` | `"N1"` | string |
| `pointsOfficiels` | `4523` | **fiable pour tous** |
| `pointsMensuels` | `500` | ⚠️ buggé pour les numérotés nationaux (ex. `4`) |
| `partiesDisputees` | `6` | |
| `pctVictoires` / `pctDefaites` | `100` / `0` | `null` si 0 partie |
| `evolutionMois` / `evolutionAnnee` | `+21` | ⚠️ buggé pour les numérotés |
| `matchs[]` | | date, `victoire`, `adversaire {numberId,nom,classement}`, `journee`, `coefficient`, `gainPerte` (signé) |

> ⚠️ Pour le **top ~100 numéroté national**, `pointsMensuels` et les évolutions
> sont incohérents côté FFTT (bug d'affichage) ; `pointsOfficiels` reste correct.
> Le nom du joueur n'est **pas** dans la page `by-number` — le récupérer via
> `search` (on l'a déjà au moment du lookup).

## Limites & notes

- **Dépend du HTML** de `www2.fftt.com` : un changement de markup peut casser le
  parseur (voir `src/parse.ts`).
- La session finit par **expirer** ; le scraper re-résout alors le CAPTCHA
  automatiquement au lancement suivant.
- Rester **poli** : pas de boucles agressives. Pour un import de masse, ajouter
  un délai entre requêtes.
- Alternative repérée si besoin : **PingPocket** (`pingpocket.fr`), companion
  FFTT sans auth ni CAPTCHA (utilisé par le scraper de référence `equipe6`).

## Côté serveur : Edge Function Supabase

La logique de ce scraper est portée dans l'Edge Function
[`supabase/functions/fftt/`](../../supabase/functions/fftt/), appelée par l'app
Expo via `supabase.functions.invoke('fftt', …)`. L'Edge Function ne fait **pas**
d'OCR : elle consomme un `PHPSESSID` validé que **ce script** lui fournit.

### `refresh-session` — alimenter la session côté serveur

```bash
cp .env.example .env          # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run fftt -- refresh-session
```

Résout le CAPTCHA puis upload le `PHPSESSID` validé dans la table `fftt_session`.
À lancer en **cron** (la session FFTT expire après quelques heures) — voir le
[README de l'Edge Function](../../supabase/functions/fftt/README.md) (exemple
GitHub Actions).
