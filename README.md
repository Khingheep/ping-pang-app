# 🏓 Ping Pang App v2 — Next.js

## Nouveautés v2
- **NavBar unique** : table de ping-pong 2D interactive (Canvas) avec balle 3D lumineuse et traînée verte hawk-eye
- **Navigation** : Feed / Rank / Jouer / Carte / Profil (alignée sur le Figma)
- **Tournoi complet** : formulaire → génération des poules → tableau à élimination directe
- **Carte** : venues interactifs avec filtres Intérieur/Extérieur
- **Classement** : mondial + Paris

## Lancer en local
```bash
npm install
npm run dev
# → http://localhost:3000
```

## Déployer sur Vercel
```bash
npm install -g vercel
vercel
```

## Structure
```
src/app/
├── onboarding/    # Auth + 4 étapes
├── feed/          # Activité sociale
├── classement/    # ELO mondial + Paris
├── jouer/         # Hub + Défi + Tournoi (poules + bracket)
├── carte/         # Venues interactifs
└── profil/        # Stats + ELO + matchs
src/components/ui/
└── NavBar.tsx     # Table ping-pong Canvas
```
