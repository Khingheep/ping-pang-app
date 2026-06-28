import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { confirm, notify } from '@/lib/ui/alert';
import {
  blockUser,
  fetchThread,
  isBlocked,
  sendMessage,
  subscribeIncomingMessages,
  unblockUser,
  type Message,
} from '@/lib/social/messages';

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!myId || !otherId) return;
    fetchThread(myId, otherId).then(setMessages);
    isBlocked(myId, otherId).then(setBlocked);
    const unsub = subscribeIncomingMessages(myId, (m) => {
      if (m.sender === otherId) setMessages((prev) => [...prev, m]);
    });
    return unsub;
  }, [myId, otherId]);

  async function send() {
    if (!myId || !otherId || !text.trim() || blocked) return;
    const body = text.trim();
    setText('');
    const tmpId = `tmp-${messages.length}`;
    const optimistic: Message = {
      id: tmpId,
      sender: myId,
      recipient: otherId,
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendMessage(myId, otherId, body);
    } catch {
      // Échec (ex. destinataire t'a bloqué) : on retire le message optimiste.
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      notify('Message non envoyé', "Le message n'a pas pu être envoyé.");
    }
  }

  async function toggleBlock() {
    if (!myId || !otherId) return;
    if (blocked) {
      try {
        await unblockUser(myId, otherId);
        setBlocked(false);
      } catch {
        notify('Oups', "Le joueur n'a pas pu être débloqué.");
      }
      return;
    }
    if (
      !(await confirm({
        title: `Bloquer ${name || 'ce joueur'} ?`,
        message: 'Il ne pourra plus t’envoyer de messages.',
        confirmText: 'Bloquer',
        destructive: true,
      }))
    )
      return;
    try {
      await blockUser(myId, otherId);
      setBlocked(true);
    } catch {
      notify('Oups', "Le joueur n'a pas pu être bloqué.");
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">{name ?? 'Conversation'}</ThemedText>
          <Pressable onPress={toggleBlock} hitSlop={12}>
            <Ionicons name={blocked ? 'lock-open-outline' : 'ban-outline'} size={22} color={blocked ? Palette.redInk : Palette.onyx} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map((m) => {
              const mine = m.sender === myId;
              return (
                <View key={m.id} style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <ThemedText type="default" themeColor={mine ? 'onBrand' : 'text'}>
                      {m.body}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {blocked ? (
            <View style={styles.blockedBanner}>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Tu as bloqué ce joueur. Débloque-le pour reprendre la conversation.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Message…"
                placeholderTextColor={Palette.grey}
                value={text}
                onChangeText={setText}
                onSubmitEditing={send}
              />
              <Pressable style={styles.sendBtn} onPress={send}>
                <Ionicons name="arrow-up" size={22} color={Palette.whitePP} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  bubbleRow: { flexDirection: 'row' },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleMine: { backgroundColor: Palette.evergreen, borderBottomRightRadius: Radius.xs },
  bubbleTheirs: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, borderBottomLeftRadius: Radius.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, paddingTop: Spacing.two },
  input: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.four,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  blockedBanner: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: Palette.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
});
