/**
 * Catalogue typé des événements analytics.
 *
 * 1 event = 1 clé ; la valeur = le type du payload (ou `undefined` si pas de payload).
 * Ajouter un event ici le rend disponible ET typé dans `analytics.track(...)`.
 *
 * Convention : `domaine_action` en snake_case (compatible PostHog / SQL).
 *
 * ⚠️ Les events marqués SERVER-SIDE doivent être émis depuis les Edge Functions
 * (non spoofables depuis le client) — cf. ARCHITECTURE.md §5. Ils sont listés ici
 * pour garder un seul catalogue de vérité, mais on ne les `track()` pas depuis l'app.
 */
export type AnalyticsEventMap = {
  // — Cycle de vie (client)
  app_opened: undefined;

  // — Onboarding (client)
  onboarding_started: undefined;
  onboarding_step_completed: { step: string };
  onboarding_completed: undefined;
  fftt_search_performed: { query_length: number; results_count: number };

  // — Monétisation
  paywall_viewed: { source: string }; // client
  premium_subscribed: { plan: 'monthly' | 'yearly' }; // SERVER-SIDE (webhook Stripe)
  premium_churned: undefined; // SERVER-SIDE (webhook Stripe)

  // — Match / ELO — SERVER-SIDE (Edge Functions : validation + calcul ELO)
  match_recorded: { match_id: string; mode: 'ranked' | 'friendly' | 'handicap' };
  match_confirmed: { match_id: string };
  match_disputed: { match_id: string };
  elo_changed: { player_id: string; delta: number; new_elo: number };
  elo_tier_up: { new_tier: string };

  // — Défis / tournois / entraînement / social
  challenge_sent: { challenge_id: string };
  challenge_accepted: { challenge_id: string };
  tournament_created: { tournament_id: string };
  tournament_joined: { tournament_id: string };
  training_logged: { training_id: string };
  friend_added: { friend_id: string };

  // — FFTT
  fftt_imported: { ranking?: string };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
