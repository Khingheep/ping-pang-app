import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchThread, sendMessage, subscribeIncomingMessages, type Message } from '@/lib/social/messages';

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!myId || !otherId) return;
    fetchThread(myId, otherId).then(setMessages);
    const unsub = subscribeIncomingMessages(myId, (m) => {
      if (m.sender === otherId) setMessages((prev) => [...prev, m]);
    });
    return unsub;
  }, [myId, otherId]);

  async function send() {
    if (!myId || !otherId || !text.trim()) return;
    const body = text.trim();
    setText('');
    const optimistic: Message = {
      id: `tmp-${messages.length}`,
      sender: myId,
      recipient: otherId,
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendMessage(myId, otherId, body);
    } catch {
      // ignore for demo
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
          <View style={{ width: 26 }} />
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
});
