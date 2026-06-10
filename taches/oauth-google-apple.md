# 🔑 OAuth Google + Apple — À FAIRE PLUS TARD

Le code app est **déjà câblé** (`signIn('google')` / `signIn('apple')` dans `src/lib/auth/auth-provider.tsx`, boutons sur l'écran login). Il ne manque que la config côté providers + Supabase.

## Google
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Créer un **OAuth Client ID** (type **Web application**)
3. Authorized redirect URI : `https://grpfestejyaxuudwixig.supabase.co/auth/v1/callback`
4. Copier **Client ID** + **Client Secret**
5. Supabase Dashboard → **Authentication → Providers → Google** → Enable → coller ID/Secret → Save

## Apple
1. Apple Developer → Identifiers → **Services ID** (ex: `paris.pingpang.signin`)
2. Configurer le domaine + return URL `https://grpfestejyaxuudwixig.supabase.co/auth/v1/callback`
3. Créer une **Sign in with Apple key** (.p8) → noter Key ID + Team ID
4. Supabase → **Authentication → Providers → Apple** → coller Services ID + génération du secret

## Supabase — Redirect URLs
**Authentication → URL Configuration → Redirect URLs** → ajouter :
```
pingpangparis://
```

Une fois fait : les boutons Google/Apple du login fonctionnent directement, aucun code à changer.
