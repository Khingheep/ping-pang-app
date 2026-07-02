import { useQuery } from '@tanstack/react-query';
import * as ImageManipulator from 'expo-image-manipulator';

import { proposeMatch } from '@/lib/matches/confirm';
import { countSets, formatSetScores, type SetScore } from '@/lib/matches/sets';
import { qk, STALE } from '@/lib/query/keys';
import { sendChallenge, type ChallengeFormat } from '@/lib/social/challenges';
import { supabase } from '@/lib/supabase/client';

/** Type de message. 'text' = bulle classique ; les autres s'affichent comme des cartes. */
export type MessageKind = 'text' | 'image' | 'gif' | 'challenge' | 'match_result';

/** Données structurées d'une carte, selon le `kind`. `body` en garde toujours un résumé lisible. */
export type MessagePayload =
  | { url: string } // image | gif (uri publique)
  | { challengeId: string; format: ChallengeFormat } // challenge
  | { matchId: string; setScores: string | null; score: string; bestOf: number }; // match_result (vu du proposeur)

export type Message = {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  kind: MessageKind;
  payload: MessagePayload | null;
  /** Accusés WhatsApp : null = envoyé, delivered_at = reçu (✓✓ gris), read_at = lu (✓✓ bleu). */
  delivered_at: string | null;
  read_at: string | null;
};

const MSG_COLS = 'id, sender, recipient, body, created_at, kind, payload, delivered_at, read_at';

export type Conversation = {
  otherId: string;
  otherName: string;
  lastBody: string;
  lastAt: string;
  archived: boolean;
};

/** Instant (ISO) avant lequel les messages sont masqués pour `myId` dans la conv avec `otherId`. */
async function fetchClearedAt(myId: string, otherId: string): Promise<string | null> {
  const { data } = await supabase
    .from('conversation_states')
    .select('cleared_at')
    .eq('owner', myId)
    .eq('other', otherId)
    .maybeSingle();
  return (data as { cleared_at: string | null } | null)?.cleared_at ?? null;
}

export async function fetchThread(myId: string, otherId: string): Promise<Message[]> {
  const clearedAt = await fetchClearedAt(myId, otherId);
  let q = supabase
    .from('messages')
    .select(MSG_COLS)
    .or(`and(sender.eq.${myId},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${myId})`)
    .order('created_at', { ascending: true });
  if (clearedAt) q = q.gt('created_at', clearedAt);
  const { data } = await q;
  return (data as Message[] | null) ?? [];
}

/**
 * Insère un message (texte ou carte) et renvoie la ligne créée.
 * `body` doit toujours être un résumé lisible (sert à la liste des conversations + à la notif).
 */
export async function sendMessage(
  fromId: string,
  toId: string,
  body: string,
  opts: { kind?: MessageKind; payload?: MessagePayload } = {},
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender: fromId, recipient: toId, body, kind: opts.kind ?? 'text', payload: opts.payload ?? null })
    .select(MSG_COLS)
    .single();
  if (error) throw error;
  return data as Message;
}

// ───────────────────────── Médias (photo / GIF) ─────────────────────────

/** Compresse une photo (resize 1280px, JPEG 0.6) avant upload - même réglage que les séances. */
async function compressPhoto(uri: string): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1280 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

/** Upload une photo dans le bucket `chat-media` (chemin <userId>/<uuid>.jpg) → URL publique. */
export async function uploadChatImage(userId: string, uri: string): Promise<string> {
  const compressed = await compressPhoto(uri);
  const res = await fetch(compressed);
  const buf = await res.arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  return data.publicUrl;
}

/** Envoie une photo (déjà uploadée) comme message. */
export function sendImageMessage(fromId: string, toId: string, url: string): Promise<Message> {
  return sendMessage(fromId, toId, '📷 Photo', { kind: 'image', payload: { url } });
}

/** Envoie un GIF (URL Tenor/Giphy) comme message. */
export function sendGifMessage(fromId: string, toId: string, url: string): Promise<Message> {
  return sendMessage(fromId, toId, '🎞️ GIF', { kind: 'gif', payload: { url } });
}

// ───────────────────────── Défi dans le chat ─────────────────────────

/** Crée un défi (table `challenges`) ET poste la carte de défi dans la conversation. */
export async function sendChallengeMessage(
  fromId: string,
  toId: string,
  format: ChallengeFormat,
): Promise<Message> {
  const challengeId = await sendChallenge(fromId, toId, format);
  return sendMessage(fromId, toId, `🏓 Défi ${format.toUpperCase()}`, {
    kind: 'challenge',
    payload: { challengeId, format },
  });
}

// ───────────────────────── Score dans le chat ─────────────────────────

/** Propose un match (dual-confirm, table `matches`) ET poste la carte de score dans la conversation. */
export async function sendScoreMessage(
  fromId: string,
  toId: string,
  p: { sets: SetScore[]; bestOf: number; isRanked?: boolean; feeling?: string | null },
): Promise<Message> {
  const counts = countSets(p.sets);
  const setScores = formatSetScores(p.sets) || null;
  const r = await proposeMatch({
    opponentId: toId,
    mySets: counts.a,
    oppSets: counts.b,
    bestOf: p.bestOf,
    isRanked: p.isRanked,
    feeling: p.feeling,
    setScores,
  });
  const score = `${counts.a}-${counts.b}`; // vu du proposeur
  return sendMessage(fromId, toId, `📊 Score ${score}`, {
    kind: 'match_result',
    payload: { matchId: r.match_id, setScores, score, bestOf: p.bestOf },
  });
}

// ───────────────────────── Statuts live des cartes ─────────────────────────

/** Statut courant des défis/matchs référencés par des cartes, pour afficher l'état à jour. */
export type CardStatuses = {
  challenges: Record<string, string>; // challengeId → 'sent' | 'accepted' | 'declined'
  matches: Record<string, string>; // matchId → 'pending' | 'confirmed' | 'disputed'
};

/** Lit en deux requêtes les statuts des défis et matchs cités par les messages riches. */
export async function fetchCardStatuses(messages: Message[]): Promise<CardStatuses> {
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  for (const m of messages) {
    if (m.kind === 'challenge' && m.payload && 'challengeId' in m.payload) challengeIds.push(m.payload.challengeId);
    if (m.kind === 'match_result' && m.payload && 'matchId' in m.payload) matchIds.push(m.payload.matchId);
  }
  const [ch, mt] = await Promise.all([
    challengeIds.length
      ? supabase.from('challenges').select('id, status').in('id', challengeIds)
      : Promise.resolve({ data: [] as { id: string; status: string }[] }),
    matchIds.length
      ? supabase.from('matches').select('id, status').in('id', matchIds)
      : Promise.resolve({ data: [] as { id: string; status: string }[] }),
  ]);
  const challenges: Record<string, string> = {};
  ((ch.data as { id: string; status: string }[] | null) ?? []).forEach((r) => (challenges[r.id] = r.status));
  const matches: Record<string, string> = {};
  ((mt.data as { id: string; status: string }[] | null) ?? []).forEach((r) => (matches[r.id] = r.status));
  return { challenges, matches };
}

/** IDs des joueurs que `myId` a bloqués. */
export async function fetchBlockedIds(myId: string): Promise<Set<string>> {
  const { data } = await supabase.from('blocked_users').select('blocked').eq('blocker', myId);
  return new Set(((data as { blocked: string }[] | null) ?? []).map((b) => b.blocked));
}

export async function isBlocked(myId: string, otherId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked')
    .eq('blocker', myId)
    .eq('blocked', otherId)
    .maybeSingle();
  return !!data;
}

/**
 * Liste des conversations de `myId`.
 * @param opts.archived `false` (défaut) = conversations actives, `true` = archivées.
 * Les utilisateurs bloqués et les messages "supprimés" (avant cleared_at) sont exclus.
 */
export async function fetchConversations(
  myId: string,
  opts: { archived?: boolean } = {},
): Promise<Conversation[]> {
  const wantArchived = opts.archived ?? false;

  const [{ data }, blocked, states] = await Promise.all([
    supabase
      .from('messages')
      .select('sender, recipient, body, created_at')
      .or(`sender.eq.${myId},recipient.eq.${myId}`)
      .order('created_at', { ascending: false }),
    fetchBlockedIds(myId),
    supabase.from('conversation_states').select('other, archived, cleared_at').eq('owner', myId),
  ]);

  const stateMap = new Map<string, { archived: boolean; cleared_at: string | null }>();
  ((states.data as { other: string; archived: boolean; cleared_at: string | null }[] | null) ?? []).forEach(
    (s) => stateMap.set(s.other, { archived: s.archived, cleared_at: s.cleared_at }),
  );

  const msgs = (data as Pick<Message, 'sender' | 'recipient' | 'body' | 'created_at'>[] | null) ?? [];

  const map = new Map<string, Conversation>();
  for (const m of msgs) {
    const other = m.sender === myId ? m.recipient : m.sender;
    if (blocked.has(other)) continue; // jamais d'utilisateur bloqué dans la liste
    const st = stateMap.get(other);
    if (st?.cleared_at && m.created_at <= st.cleared_at) continue; // message "supprimé" pour moi
    const archived = st?.archived ?? false;
    if (archived !== wantArchived) continue; // bonne section (active vs archivée)
    if (!map.has(other)) {
      map.set(other, { otherId: other, otherName: '', lastBody: m.body, lastAt: m.created_at, archived });
    }
  }

  const ids = [...map.keys()];
  if (ids.length) {
    const { data: ps } = await supabase.from('players').select('id, display_name').in('id', ids);
    ((ps as { id: string; display_name: string }[] | null) ?? []).forEach((p) => {
      const c = map.get(p.id);
      if (c) c.otherName = p.display_name;
    });
  }
  return [...map.values()];
}

/** Archive (ou désarchive) la conversation avec `otherId` pour `myId`. */
export async function setConversationArchived(myId: string, otherId: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('conversation_states')
    .upsert(
      { owner: myId, other: otherId, archived, updated_at: new Date().toISOString() },
      { onConflict: 'owner,other' },
    );
  if (error) throw error;
}

/**
 * "Supprime" la conversation côté `myId` : masque tous les messages actuels.
 * N'efface rien chez l'autre. Un nouveau message la fera réapparaître.
 */
export async function clearConversation(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('conversation_states').upsert(
    {
      owner: myId,
      other: otherId,
      cleared_at: new Date().toISOString(),
      archived: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner,other' },
  );
  if (error) throw error;
}

/** Bloque `otherId` : il disparaît de la liste et ne pourra plus m'écrire. */
export async function blockUser(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('blocked_users').insert({ blocker: myId, blocked: otherId });
  if (error && error.code !== '23505') throw error; // ignore "déjà bloqué"
}

export async function unblockUser(myId: string, otherId: string): Promise<void> {
  const { error } = await supabase.from('blocked_users').delete().eq('blocker', myId).eq('blocked', otherId);
  if (error) throw error;
}

// Compteur process-wide : garantit un nom de canal unique par abonnement. Sans ça, deux écrans
// (Messages + Chat) qui s'abonnent au même `messages-${myId}` réutilisent le canal déjà `subscribe()`,
// et le 2e `.on('postgres_changes')` plante ("cannot add callbacks after subscribe()").
let channelSeq = 0;

/** Abonnement realtime aux nouveaux messages reçus. Retourne une fonction d'unsubscribe. */
export function subscribeIncomingMessages(myId: string, onInsert: (m: Message) => void): () => void {
  const channel = supabase
    .channel(`messages-${myId}-${++channelSeq}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${myId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Abonnement realtime aux MISES À JOUR de MES messages envoyés (filtre sender) :
 * c'est ce qui fait passer les coches de ✓ → ✓✓ gris → ✓✓ bleu en direct chez l'expéditeur.
 */
export function subscribeMyMessageReceipts(myId: string, onUpdate: (m: Message) => void): () => void {
  const channel = supabase
    .channel(`receipts-${myId}-${++channelSeq}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender=eq.${myId}` },
      (payload) => onUpdate(payload.new as Message),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ───────────────────────── Accusés de lecture ─────────────────────────

/** Marque comme « reçus + lus » tous les messages que m'a envoyés `otherId` (à l'ouverture du chat). */
export async function markThreadRead(otherId: string): Promise<void> {
  await supabase.rpc('mark_thread_read', { p_other: otherId });
}

/** Marque comme « reçus » tous mes messages entrants non livrés (destinataire joignable). */
export async function markDelivered(): Promise<void> {
  await supabase.rpc('mark_messages_delivered');
}

/** Nombre de messages non lus qui me sont adressés (pour la pastille de l'icône Messages). */
export async function unreadMessageCount(myId: string): Promise<number> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient', myId)
    .is('read_at', null);
  return count ?? 0;
}

/** Compteur de messages non lus (mis en cache) - pour la pastille rouge de l'icône Messages. */
export function useUnreadMessages(myId: string | undefined) {
  return useQuery({
    queryKey: qk.messages.unread(myId ?? 'anon'),
    queryFn: () => unreadMessageCount(myId!),
    enabled: !!myId,
    staleTime: STALE.notifications,
  });
}
