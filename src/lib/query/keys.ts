/**
 * Conventions de cache TanStack Query.
 * - `qk` : factory de query keys hiérarchiques (du général au spécifique). Les préfixes
 *   stables (['feed'], ['notifications']) permettent l'invalidation groupée par préfixe :
 *   `invalidateQueries({ queryKey: ['feed'] })` invalide séances ET matchs d'un coup.
 * - `STALE` : durée de fraîcheur par type de donnée. Tant qu'une query est "fresh", un
 *   refetch (déclenché au focus d'écran) est un no-op réseau → retour d'onglet instantané.
 */

export const qk = {
  profile: (id: string) => ['profile', id] as const,
  eloDelta: (id: string, days: number) => ['eloDelta', id, days] as const,

  leaderboard: () => ['leaderboard'] as const,
  otherPlayers: (excludeId: string) => ['players', 'others', excludeId] as const,

  feed: {
    sessions: (myId: string) => ['feed', 'sessions', myId] as const,
    matches: (myId: string) => ['feed', 'matches', myId] as const,
  },

  pending: (myId: string) => ['pending', myId] as const,

  notifications: {
    unread: () => ['notifications', 'unread'] as const,
    list: () => ['notifications', 'list'] as const,
  },

  messages: {
    unread: (id: string) => ['messages', 'unread', id] as const,
  },

  challenges: {
    incoming: (id: string) => ['challenges', 'incoming', id] as const,
    outgoing: (id: string) => ['challenges', 'outgoing', id] as const,
    active: (id: string) => ['challenges', 'active', id] as const,
  },

  friends: {
    ids: (id: string) => ['friends', 'ids', id] as const,
    status: (myId: string, otherId: string) => ['friends', 'status', myId, otherId] as const,
  },

  matches: {
    recent: (id: string) => ['matches', 'recent', id] as const,
    ofPlayer: (id: string) => ['matches', 'player', id] as const,
  },

  training: {
    stats: (id: string) => ['training', 'stats', id] as const,
    lastSession: (id: string) => ['training', 'last', id] as const,
  },

  tournaments: {
    mine: (id: string) => ['tournaments', 'mine', id] as const,
  },

  venues: {
    upcomingSlots: () => ['venues', 'slots', 'upcoming'] as const,
    home: (id: string) => ['venues', 'home', id] as const,
    featured: () => ['venues', 'featured'] as const,
    bbox: (key: string) => ['venues', 'bbox', key] as const,
  },

  fftt: {
    commonOpponents: (myFftt: string, otherFftt: string) =>
      ['fftt', 'common', myFftt, otherFftt] as const,
  },
} as const;

/** staleTime (ms) par type de donnée - voir l'audit perf pour la justification des durées. */
export const STALE = {
  profile: 5 * 60_000, // change rarement en session ; l'ELO bouge via mutations invalidées
  leaderboard: 60_000, // liste large/coûteuse, tolère 1 min de péremption
  feed: 30_000, // contenu social, fraîcheur attendue mais pas temps réel
  pending: 15_000, // action critique (matchs à confirmer)
  notifications: 10_000, // la cloche doit rester réactive
  challenges: 20_000,
  players: 60_000,
  venues: 60_000,
  trainingStats: 5 * 60_000,
} as const;
