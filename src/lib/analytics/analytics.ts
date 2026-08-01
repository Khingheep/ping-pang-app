import { hasAnalyticsConsent } from './consent';
import type { AnalyticsEventMap, AnalyticsEventName } from './events';

/**
 * Couche analytics découplée du vendor.
 *
 * L'app émet des events typés via `analytics.*` sans jamais connaître PostHog.
 * Un « sink » reçoit ces events et les envoie à un backend. Tant qu'aucun sink
 * n'est branché (dev sans backend, ou clé PostHog absente), tout est **no-op** —
 * donc l'instrumentation ne peut jamais casser l'app. Même logique défensive que
 * `isSupabaseConfigured`.
 *
 * Pour activer PostHog : voir `README.md` de ce dossier (branchement en 1 fichier).
 */
export type AnalyticsSink = {
  track(event: string, props?: Record<string, unknown>): void;
  identify(distinctId: string, traits?: Record<string, unknown>): void;
  reset(): void;
  screen(name: string, props?: Record<string, unknown>): void;
};

const noopSink: AnalyticsSink = {
  track() {},
  identify() {},
  reset() {},
  screen() {},
};

// En dev, on trace en console pour vérifier l'instrumentation sans backend.
function devLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.debug('[analytics]', ...args);
}
const devSink: AnalyticsSink = {
  track: (e, p) => devLog('track', e, p ?? {}),
  identify: (id, t) => devLog('identify', id, t ?? {}),
  reset: () => devLog('reset'),
  screen: (n, p) => devLog('screen', n, p ?? {}),
};

let sink: AnalyticsSink = __DEV__ ? devSink : noopSink;

/** Branche un backend analytics (ex: PostHog). À appeler une fois au boot. Voir README. */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

/** True quand une clé PostHog est fournie par l'env (comme isSupabaseConfigured). */
export const isAnalyticsConfigured = Boolean(process.env.EXPO_PUBLIC_POSTHOG_KEY);

type TrackArgs<E extends AnalyticsEventName> = AnalyticsEventMap[E] extends undefined
  ? []
  : [props: AnalyticsEventMap[E]];

export const analytics = {
  /** Émet un event typé. No-op tant que le consentement RGPD n'est pas donné. */
  track<E extends AnalyticsEventName>(event: E, ...args: TrackArgs<E>): void {
    if (!hasAnalyticsConsent()) return;
    sink.track(event, (args[0] as Record<string, unknown> | undefined) ?? undefined);
  },
  /** Relie les events à un joueur (au login). `distinctId` = id Supabase. No-op sans consentement. */
  identify(distinctId: string, traits?: Record<string, unknown>): void {
    if (!hasAnalyticsConsent()) return;
    sink.identify(distinctId, traits);
  },
  /** Dissocie l'identité (au logout). Toujours exécuté (nettoyage), même sans consentement. */
  reset(): void {
    sink.reset();
  },
  /** Screen view (branché sur expo-router). No-op tant que le consentement RGPD n'est pas donné. */
  screen(name: string, props?: Record<string, unknown>): void {
    if (!hasAnalyticsConsent()) return;
    sink.screen(name, props);
  },
};
