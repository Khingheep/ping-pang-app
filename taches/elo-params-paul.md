# 🧪 Paramètres ELO de Paul (06/07/2026) — testés puis DÉPLOYÉS

> **06/07/2026 (soir) : EN PROD.** Migration `0059_elo_paul.sql` appliquée (via
> `apply-sql.mjs`, hors historique CLI comme 0052→0058), edge function `fftt`
> redéployée (`--use-api`), E2E validé live. Détails de la bascule en bas de page.

## La proposition

```
ELO départ = points FFTT + 500, sinon 1000
P          = 1 / (1 + 10^((ELO adverse - ELO joueur) / 400))
ELO après  = ELO + K × Poids × (Résultat - P)
K          = 80 (0-5 matchs app) · 50 (6-10) · 30 (11+)
Poids      = 1 (match app) · 1.2 (match FFTT)
```

## Ce qui existe aujourd'hui

- **Prod** : le rating est calculé en **Glicko-2** côté Postgres (`_settle_match`, migration `0013_glicko.sql`). La colonne `elo` est une projection arrondie du rating Glicko.
- **Client** : `src/lib/elo/index.ts` = ELO K=32 (affichage/niveaux) + départ FFTT actuel `1000 + points/4`.
- La proposition est implémentée dans **`src/lib/elo/proposal.ts`** (+ tests `proposal.test.ts`), banc d'essai : **`scripts/test-elo-proposal.mjs`**.

## Résultats de simulation (`node scripts/test-elo-proposal.mjs`)

### A. Convergence d'un nouveau (vrai niveau 1400, départ 1000)

Erreur médiane après N matchs (2000 simulations) :

| Système | 5 | 10 | 20 | 30 | 50 | 1er passage ±50 |
|---|---|---|---|---|---|---|
| **Paul 80/50/30** | 257 | 189 | 131 | 90 | 48 | **38 matchs** |
| App K=32 fixe | 338 | 286 | 199 | 137 | 63 | 48 matchs |
| **Glicko-2 (prod)** | 115 | 83 | 58 | 47 | 38 | **6 matchs** |

→ Le K dégressif de Paul **bat nettement le K=32 fixe** (~30 % d'erreur en moins à match égal), mais reste **6× plus lent que le Glicko-2 déjà en prod** pour caler un nouveau.

### B. Seed FFTT décalé de ±300 (K de Paul)

Symétrique et sain : erreur médiane 300 → ~90 en 20 matchs, ~65 en 30. Un mauvais seed se corrige, sans effet pervers.

### C. Déflation du pool (nouveaux sous-cotés qui arrivent à 1000)

Pool de 60 établis bien cotés, un nouveau (vrai ~1400, départ 1000) tous les 50 matchs, 6000 matchs :

| Système | dérive établis |
|---|---|
| Paul 80/50/30 | **-163 pts** |
| K=32 fixe | -206 pts |

→ Tout système où les nouveaux partent sous leur vrai niveau **siphonne les points des anciens**. Le K dégressif atténue (convergence plus rapide = moins de siphon), mais la vraie parade c'est **le seed FFTT au départ** — d'où l'intérêt du `points + 500`. Reste le cas des non-licenciés à 1000.

### D. ⚠️ Piège : K indexé sur les matchs **app** uniquement

Un joueur 100 % FFTT garde K=80 pour toujours (80 × 1.2 = **96 pts d'amplitude par match, à vie**). Joueur bien coté à 1800, 40 matchs FFTT contre son niveau :

| Règle | écart-type final | extrêmes |
|---|---|---|
| Spec littérale (K figé 80) | **±97 pts** | 1473 / 2147 |
| FFTT compte dans les paliers K | ±60 pts | 1602 / 2008 |

→ **Reco : faire compter tous les matchs classés (app + FFTT) dans les paliers K**, pas seulement les matchs app.

## Points de calibration

1. **`points FFTT + 500` est sémantiquement compatible ELO** : l'échelle 1:1 préserve les écarts (400 pts FFTT d'écart ≈ 91 % de victoire, cohérent avec la réalité FFTT). Le mapping actuel de l'app (`1000 + pts/4`) compresse les écarts ×4 : deux licenciés à 400 pts d'écart FFTT démarrent à 100 pts d'écart ELO = 64 % au lieu de ~91 %. **Le départ de Paul est meilleur que l'actuel.**
2. **Non-zéro-somme entre paliers** : nouveau (K=80) qui bat un établi (K=30) → +40/-15. C'est assumable (c'est ce qui accélère la convergence), mesuré au scénario C.
3. **Matchs FFTT** : l'adversaire n'est pas dans l'app → prendre `classement officiel adverse + 500` comme ELO adverse (le champ `adversaire_classement` existe déjà dans `fftt_matches`, migration 0020).
4. **ELO vs Glicko-2** : si l'objectif de Paul est la **lisibilité** (deltas prévisibles, formule explicable), sa proposition est un bon ELO. Si l'objectif est la **précision**, le Glicko-2 en prod fait déjà mieux. À trancher produit, pas maths.

## Bascule effectuée (06/07/2026)

**SQL — `supabase/migrations/0059_elo_paul.sql`** (appliquée en prod) :
- Helpers `_elo_expected` / `_elo_k` / `_app_match_count` / `_level_for_elo`.
- `_settle_match` réécrit en ELO Paul (structure 0013 conservée : double confirmation, feed). K évalué par joueur sur ses matchs app déjà réglés → non zéro-somme entre paliers (assumé).
- `propose_match` (version 7 params de 0042) : preview delta en ELO Paul.
- Départ : défaut `players.elo` 1200 → **1000** ; **RESET de tous les ELO** (licencié → points+500, sinon 1000, invités exclus) — tracé dans `rating_history` (16 snapshots). Backup avant reset : `scripts/backup-pre-0059.json` (+ colonnes glicko_* gelées en place) = chemin de rollback.
- `players.fftt_linked_at` (+ trigger sur changement de `fftt_id`) = borne anti-double-comptage : les matchs FFTT antérieurs à la liaison sont réputés inclus dans le seed points+500.
- `fftt_matches` : colonnes `elo_applied`/`elo_delta`/`elo_skip_reason` ; les 274 matchs existants baselinés.
- `apply_fftt_matches(licence)` : applique les nouveaux matchs FFTT à poids 1.2. ELO adverse par priorité : joueur app lié → miroir `fftt_players` (points+500) → classement legacy → sinon skip tracé (`adversaire_inconnu`). Réservée service_role.
- `create_tournament_guest` : défaut invité 1200 → 1000 (copie de 0056).

**Edge function `fftt`** : appelle `apply_fftt_matches` après chaque upsert d'historique (déployée avec le fix WIP collisions de clés). E2E validé : match antérieur à la liaison → skip `avant_liaison`, ELO intact.

**Client** : `src/lib/elo/index.ts` = système Paul (l'ex-`proposal.ts` y est fusionné) ; `startingElo` remplace `ffttPointsToElo` (link FFTT + onboarding) ; fallbacks d'affichage 1200 → 1000. 70 tests vitest ✅, tsc ✅.

## ⚠️ Restes / à trancher avec Paul

1. **Paliers de niveaux à recalibrer** : l'échelle points+500 va bien au-delà de 2100 → TOUS les licenciés sont « Legend » (paul 2773, antoine 4017…). L'échelle Rookie→Legend (1100-2100) datait de l'échelle compressée pts/4. Idem les tranches ELO de `new-slot.tsx` (900-1200, 1200+).
2. **K figé sur les matchs app** (spec littérale) : un joueur 100 % FFTT reste à K=80×1.2 à vie (±97 pts de bruit, cf. scénario D). Reco maintenue : compter aussi les matchs FFTT appliqués dans les paliers K (changement d'une ligne dans `_elo_k`/compteur).
3. Glicko-2 gelé mais réversible (colonnes + `_glicko_update` en place, backup JSON).

_Maj : 2026-07-06 — walid (bascule prod incluse)_
