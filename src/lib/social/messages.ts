import { supabase } from '@/lib/supabase/client';

export type Message = {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
};

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
    .select('id, sender, recipient, body, created_at')
    .or(`and(sender.eq.${myId},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${myId})`)
    .order('created_at', { ascending: true });
  if (clearedAt) q = q.gt('created_at', clearedAt);
  const { data } = await q;
  return (data as Message[] | null) ?? [];
}

export async function sendMessage(fromId: string, toId: string, body: string): Promise<void> {
  const { error } = await supabase.from('messages').insert({ sender: fromId, recipient: toId, body });
  if (error) throw error;
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
