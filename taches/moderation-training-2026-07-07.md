# 🛡️ Batch du 07/07/2026 — retours Paul (modération + flow séance)

> **EN PROD** : migration `0060_moderation.sql` appliquée le 07/07 (même canal que 0059,
> `apply-sql.mjs` hors historique CLI). Côté client : recharger l'app (`expo start`) suffit,
> pas d'edge function touchée.

## 1. Flow « ajouter une séance » façon onboarding (frame Paul)

`new-training.tsx` refondu en wizard 6 étapes (les questions s'enchaînent) :
**Travaillé quoi ?** (banque d'exos + coups techniques) → **Durée** → **Avec qui ?** →
**Où ?** → **Feeling + sensations** → **Photo pour le feed** (+ récap) → Enregistrer.

- Banque d'exos (`EXERCISES_BANK`, lib training) : 2-2, Falkenberg, 3 points, Démarrage
  revers, Démarrage coup droit, Revers-Milieu-Revers-Coup droit, Suédois, 2-1-1-2.
- Exos et coups sont stockés ensemble dans `strokes` (zéro migration, stats/feed/templates
  marchent tels quels) — un exo se distingue d'un coup par appartenance à `EXERCISES_BANK`.
- « Répéter une séance » (templates) reste en étape 1 et pré-remplit tout → saute à la fin.
- Seule contrainte : au moins 1 exo/coup coché. Le reste est optionnel comme avant.

## 2. Contestation de score : 3 refus max (question Quentin)

- `players.dispute_count` + garde dans `dispute_match` : au 4ᵉ refus → erreur
  « Limite de contestations atteinte (3)… » affichée telle quelle par l'app.
- Compteur remis à zéro possible par un admin (« RAZ refus » dans l'écran admin).

## 3. Auto-acceptation à 48 h

- Cron pg_cron `auto-confirm-matches-hourly` (xx:15) : tout match `pending` créé il y a
  plus de 48 h est confirmé des deux côtés → `_settle_match` (ELO + feed) + notif aux deux.
- Vérifié en prod : job actif, run à blanc OK (0 match en retard).

## 4. Signalement fraude + dashboard admin

- Table `player_reports` (RLS : chacun voit ses signalements, les admins voient tout ;
  1 signalement ouvert max par paire signaleur→signalé).
- Bouton « Signaler ce joueur » sur le profil (motifs : triche / usurpation / comportement).
- `players.is_admin` (walid + paul en prod) → entrée « Admin · Signalements » dans Réglages
  → écran `/admin` : liste des signalements ouverts (badge rouge si ≥3 refus), actions
  **Traité / Ignorer / RAZ refus / Supprimer le compte**, historique repliable.
- Fonctions SQL SECURITY DEFINER : `admin_resolve_report`, `admin_reset_disputes`,
  `admin_delete_player` (bloque auto-suppression et suppression d'un autre admin).

## 5. Clean DB avant le tournoi de demain (à lancer QUAND tu veux — PAS fait)

```bash
node scripts/apply-sql.mjs "<conn-string>" scripts/wipe-accounts-tournament.sql
```
- Vide joueurs + logins + toutes données liées ; CONSERVE venues/exercises/miroir FFTT.
- ⚠️ `delete-accounts.mjs` seul ne suffit plus : depuis 0056 la FK players→auth.users a
  sauté, supprimer les users auth ne cascade plus sur players.
- Après recréation des comptes : `update players set is_admin = true where handle in ('walid','paul');`

## En attente / discussions groupe (pas implémenté)

- Vérification d'identité licenciés (attestation FFTT dématérialisée / API fftt.com) —
  Neo regarde l'API demain ; à trancher avec l'équipe tech.
- Brand guidelines : Neo prépare une trame cette semaine → intégration < 1 jour (thème
  centralisé dans `src/constants/theme.ts`, re-skin = ce fichier uniquement).

_Maj : 2026-07-07 — walid_
