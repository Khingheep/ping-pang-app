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
};

export async function fetchThread(myId: string, otherId: string): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, sender, recipient, body, created_at')
    .or(`and(sender.eq.${myId},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${myId})`)
    .order('created_at', { ascending: true });
  return (data as Message[] | null) ?? [];
}

export async function sendMessage(fromId: string, toId: string, body: string): Promise<void> {
  const { error } = await supabase.from('messages').insert({ sender: fromId, recipient: toId, body });
  if (error) throw error;
}

export async function fetchConversations(myId: string): Promise<Conversation[]> {
  const { data } = await supabase
    .from('messages')
    .select('sender, recipient, body, created_at')
    .or(`sender.eq.${myId},recipient.eq.${myId}`)
    .order('created_at', { ascending: false });
  const msgs = (data as Pick<Message, 'sender' | 'recipient' | 'body' | 'created_at'>[] | null) ?? [];

  const map = new Map<string, Conversation>();
  for (const m of msgs) {
    const other = m.sender === myId ? m.recipient : m.sender;
    if (!map.has(other)) map.set(other, { otherId: other, otherName: '', lastBody: m.body, lastAt: m.created_at });
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

/** Abonnement realtime aux nouveaux messages reçus. Retourne une fonction d'unsubscribe. */
export function subscribeIncomingMessages(myId: string, onInsert: (m: Message) => void): () => void {
  const channel = supabase
    .channel(`messages-${myId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${myId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
