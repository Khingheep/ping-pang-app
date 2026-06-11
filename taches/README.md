# 📋 Tâches Ping Pang Paris

Suivi des tâches qui nécessitent une action manuelle ou un accès externe.

## À faire (nécessite tes accès)
- [ ] **OAuth Google + Apple** → voir [oauth-google-apple.md](oauth-google-apple.md) — _à faire plus tard_

## Refresh session FFTT — AUTOMATIQUE ✅
- **Cloud (principal)** : GitHub Actions `walidb212/pingpang-fftt-refresher` → cron toutes les 6h, résout le CAPTCHA et upload la session. Indépendant du PC. Testé OK.
- **Local (backup, redondant)** : tâche planifiée Windows `PingPangFFTTRefresh` (toutes les 6h). Tu peux la désactiver : `schtasks /Change /TN PingPangFFTTRefresh /DISABLE`.
- **Manuel** si besoin : `cd scripts/fftt && npm run fftt -- refresh-session`
- ⚠️ Note : la fonction edge Supabase NE PEUT PAS faire l'OCR (pas de Web Workers dans le runtime Deno edge) → c'est pour ça qu'on passe par GitHub Actions.

## Fait ✅
- [x] App complète (5 onglets + onboarding + match/ELO + tournoi + chat + notifs + map/events + training)
- [x] Supabase live (migrations 0001→0006 appliquées, RLS, RPC, triggers, realtime)
- [x] **Edge function `fftt` déployée + session valide + bouton « Lier mon compte FFTT » câblé** (Paramètres) → remplit `players.fftt_points`. Testé : LEBRUN Felix = 4523 pts.
- [x] Lancée sur Expo Go pour test

_Maj : 2026-06-10_
