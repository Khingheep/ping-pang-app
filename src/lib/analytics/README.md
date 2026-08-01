# Analytics

Couche d'instrumentation **découplée du vendor**. L'app émet des events typés via
`analytics.*` sans connaître PostHog. Un « sink » les envoie à un backend ; tant qu'aucun
sink n'est branché (ou clé PostHog absente), tout est **no-op** — l'instrumentation ne peut
jamais casser l'app (même logique que `isSupabaseConfigured`).

## Utilisation

```ts
import { analytics } from '@/lib/analytics';

analytics.track('paywall_viewed', { source: 'profil' });
analytics.track('onboarding_completed');
```

- Le catalogue d'events (typé) est dans `events.ts`. Ajouter un event = ajouter une clé là.
- `identify` (login) / `reset` (logout) et les **screen views** sont déjà branchés
  automatiquement dans `src/app/_layout.tsx` (`useAnalyticsIdentify`, `useScreenTracking`).
- En dev, les events s'affichent en console (`[analytics] track ...`) même sans backend.

> ⚠️ Les events **match / ELO / premium** doivent être émis **server-side** depuis les
> Edge Functions (non spoofables), pas depuis l'app — cf. `ARCHITECTURE.md` §5.

## Activer PostHog (branchement en 1 fichier)

1. **Installer le SDK** (pense à rebuild EAS ensuite, c'est un module natif) :
   ```bash
   npx expo install posthog-react-native expo-file-system expo-application expo-device expo-localization
   ```

2. **Créer le sink** `src/lib/analytics/posthog-sink.ts` :
   ```ts
   import PostHog from 'posthog-react-native';
   import type { AnalyticsSink } from './analytics';

   export function createPostHogSink(): AnalyticsSink | null {
     const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
     if (!apiKey) return null; // pas de clé => on laisse le no-op
     const posthog = new PostHog(apiKey, {
       host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
     });
     return {
       track: (e, p) => posthog.capture(e, p),
       identify: (id, t) => posthog.identify(id, t),
       reset: () => posthog.reset(),
       screen: (name, p) => posthog.screen(name, p),
     };
   }
   ```

3. **Le brancher au boot** — dans `src/app/_layout.tsx`, en haut de `RootLayout` :
   ```ts
   import { setAnalyticsSink } from '@/lib/analytics';
   import { createPostHogSink } from '@/lib/analytics/posthog-sink';

   const sink = createPostHogSink();
   if (sink) setAnalyticsSink(sink);
   ```

4. **Renseigner la clé** `EXPO_PUBLIC_POSTHOG_KEY` par env : dans `eas.json`
   (`development`/`preview`/`beta` = projet PostHog **staging**, `production` = **prod**)
   et dans `.env` pour le dev local. Host = `https://eu.i.posthog.com` (RGPD).

C'est tout : aucun call-site à changer, tous les events déjà émis partent vers PostHog.

## Feature flags

Une fois PostHog branché, ajouter un helper `flags.ts` autour de `posthog.getFeatureFlag(...)`
pour piloter la rampe **beta fermée → beta ouverte → public** et le gating **Premium**
(cf. `ARCHITECTURE.md` §5.3).
