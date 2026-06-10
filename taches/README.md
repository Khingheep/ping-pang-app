# 📋 Tâches Ping Pang Paris

Suivi des tâches qui nécessitent une action manuelle ou un accès externe.

## À faire (nécessite tes accès)
- [ ] **OAuth Google + Apple** → voir [oauth-google-apple.md](oauth-google-apple.md) — _à faire plus tard_

## Récurrent
- [ ] **Rafraîchir la session FFTT quand elle expire** (le CAPTCHA réapparaît au bout de quelques heures/jours) :
  ```bash
  cd scripts/fftt && npm run fftt -- refresh-session
  ```
  Si l'app affiche « Session FFTT à rafraîchir », c'est ça qu'il faut relancer.

## Fait ✅
- [x] App complète (5 onglets + onboarding + match/ELO + tournoi + chat + notifs + map/events + training)
- [x] Supabase live (migrations 0001→0006 appliquées, RLS, RPC, triggers, realtime)
- [x] **Edge function `fftt` déployée + session valide + bouton « Lier mon compte FFTT » câblé** (Paramètres) → remplit `players.fftt_points`. Testé : LEBRUN Felix = 4523 pts.
- [x] Lancée sur Expo Go pour test

_Maj : 2026-06-10_
