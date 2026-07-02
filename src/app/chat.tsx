import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChallengeCard } from '@/components/chat-cards';
import { GifPicker } from '@/components/gif-picker';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { qk } from '@/lib/query/keys';
import { FORMAT_INFO, respondChallenge, type ChallengeFormat } from '@/lib/social/challenges';
import { confirm, notify } from '@/lib/ui/alert';
import {
  blockUser,
  fetchCardStatuses,
  fetchThread,
  isBlocked,
  markThreadRead,
  sendChallengeMessage,
  sendGifMessage,
  sendImageMessage,
  sendMessage,
  subscribeIncomingMessages,
  subscribeMyMessageReceipts,
  unblockUser,
  uploadChatImage,
  type CardStatuses,
  type Message,
} from '@/lib/social/messages';

const CHALLENGE_FORMATS: ChallengeFormat[] = ['bo5', 'bo3', 'bo7'];

const EMPTY_STATUSES: CardStatuses = { challenges: {}, matches: {} };

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { session } = useAuth();
  const qc = useQueryClient();
  const myId = session?.user?.id;
  const otherName = name ?? 'Joueur';
  const [messages, setMessages] = useState<Message[]>([]);
  const [statuses, setStatuses] = useState<CardStatuses>(EMPTY_STATUSES);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function refreshStatuses(msgs: Message[]) {
    setStatuses(await fetchCardStatuses(msgs));
  }

  // Marque la conversation comme lue (✓✓ bleu chez l'expéditeur) et rafraîchit la pastille du feed.
  const markRead = useCallback(() => {
    if (!myId || !otherId) return;
    void markThreadRead(otherId).then(() => qc.invalidateQueries({ queryKey: qk.messages.unread(myId) }));
  }, [myId, otherId, qc]);

  useEffect(() => {
    if (!myId || !otherId) return;
    fetchThread(myId, otherId).then((thread) => {
      setMessages(thread);
      void refreshStatuses(thread);
      markRead(); // tout ce qui est déjà à l'écran est lu
    });
    isBlocked(myId, otherId).then(setBlocked);
    const unsub = subscribeIncomingMessages(myId, (m) => {
      if (m.sender === otherId) {
        setMessages((prev) => {
          const next = [...prev, m];
          if (m.kind !== 'text') void refreshStatuses(next);
          return next;
        });
        markRead(); // reçu pendant que le chat est ouvert → lu immédiatement
      }
    });
    // Accusés de MES messages : ✓ → ✓✓ gris → ✓✓ bleu en direct.
    const unsubReceipts = subscribeMyMessageReceipts(myId, (u) => {
      if (u.recipient !== otherId) return;
      setMessages((prev) => prev.map((m) => (m.id === u.id ? { ...m, delivered_at: u.delivered_at, read_at: u.read_at } : m)));
    });
    return () => {
      unsub();
      unsubReceipts();
    };
  }, [myId, otherId, markRead]);

  /** Ajoute un message réellement inséré (carte ou média) à la conversation. */
  function appendSent(m: Message) {
    setMessages((prev) => [...prev, m]);
  }

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
      kind: 'text',
      payload: null,
      delivered_at: null,
      read_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const real = await sendMessage(myId, otherId, body);
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? real : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      notify('Message non envoyé', "Le message n'a pas pu être envoyé.");
    }
  }

  // ── Actions de la barre + ──

  async function pickAndSendImage() {
    setAttachOpen(false);
    if (!myId || !otherId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Photo', 'Autorise l’accès aux photos pour en envoyer.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets.length) return;
    try {
      setUploading(true);
      const url = await uploadChatImage(myId, res.assets[0].uri);
      appendSent(await sendImageMessage(myId, otherId, url));
    } catch {
      notify('Oups', "La photo n'a pas pu être envoyée.");
    } finally {
      setUploading(false);
    }
  }

  async function sendGif(url: string) {
    if (!myId || !otherId) return;
    try {
      appendSent(await sendGifMessage(myId, otherId, url));
    } catch {
      notify('Oups', "Le GIF n'a pas pu être envoyé.");
    }
  }

  async function sendChallengeOfFormat(format: ChallengeFormat) {
    setChallengeOpen(false);
    if (!myId || !otherId) return;
    try {
      const real = await sendChallengeMessage(myId, otherId, format);
      appendSent(real);
      setStatuses((s) => ({ ...s, challenges: { ...s.challenges, [(real.payload as { challengeId: string }).challengeId]: 'sent' } }));
      // Le défi vient d'être créé en base : on rafraîchit l'onglet Défis (« en attente »).
      void qc.invalidateQueries({ queryKey: qk.challenges.outgoing(myId) });
    } catch {
      notify('Oups', "Le défi n'a pas pu être envoyé.");
    }
  }

  // ── Actions sur les cartes ──

  async function answerChallenge(challengeId: string, status: 'accepted' | 'declined') {
    setBusyCardId(challengeId);
    try {
      await respondChallenge(challengeId, status);
      setStatuses((s) => ({ ...s, challenges: { ...s.challenges, [challengeId]: status } }));
      // Le défi reçu n'est plus « en attente » : on rafraîchit la section « Défis reçus ».
      if (myId) void qc.invalidateQueries({ queryKey: qk.challenges.incoming(myId) });
    } catch {
      notify('Oups', "L'action n'a pas pu être enregistrée.");
    } finally {
      setBusyCardId(null);
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
        title: `Bloquer ${otherName} ?`,
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

  function renderMessage(m: Message) {
    const mine = m.sender === myId;
    const rowStyle = [styles.bubbleRow, mine ? styles.right : styles.left];

    if ((m.kind === 'image' || m.kind === 'gif') && m.payload && 'url' in m.payload) {
      return (
        <View key={m.id} style={rowStyle}>
          <View>
            <Image source={{ uri: m.payload.url }} style={styles.media} resizeMode="cover" />
            {mine ? <MessageTicks message={m} onMedia /> : null}
          </View>
        </View>
      );
    }

    if (m.kind === 'challenge' && m.payload && 'challengeId' in m.payload) {
      const { challengeId, format } = m.payload;
      return (
        <View key={m.id} style={rowStyle}>
          <ChallengeCard
            format={format}
            status={statuses.challenges[challengeId] ?? 'sent'}
            mine={mine}
            busy={busyCardId === challengeId}
            onAccept={() => answerChallenge(challengeId, 'accepted')}
            onDecline={() => answerChallenge(challengeId, 'declined')}
          />
        </View>
      );
    }

    return (
      <View key={m.id} style={rowStyle}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <ThemedText type="default" themeColor={mine ? 'onBrand' : 'text'}>
            {m.body}
          </ThemedText>
          {mine ? <MessageTicks message={m} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">{otherName}</ThemedText>
          <Pressable onPress={toggleBlock} hitSlop={12}>
            <Ionicons name={blocked ? 'lock-open-outline' : 'ban-outline'} size={22} color={blocked ? Palette.redInk : Palette.onyx} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map(renderMessage)}
          </ScrollView>

          {blocked ? (
            <View style={styles.blockedBanner}>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Tu as bloqué ce joueur. Débloque-le pour reprendre la conversation.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <Pressable style={styles.attachBtn} onPress={() => setAttachOpen(true)} disabled={uploading}>
                <Ionicons name={uploading ? 'ellipsis-horizontal' : 'add'} size={24} color={Palette.evergreen} />
              </Pressable>
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

      {/*
        Barre d'actions + (photo / GIF / défi / score). OVERLAY (View absolue) et NON <Modal> :
        sur iOS, lancer le sélecteur de photos natif pendant qu'un Modal RN est affiché/en cours
        de fermeture échoue silencieusement. Un overlay simple n'entre pas en conflit.
      */}
      {attachOpen ? (
        <Pressable style={styles.overlay} onPress={() => setAttachOpen(false)}>
          <SafeAreaView edges={['bottom']} style={styles.attachSheet}>
            <View style={styles.handle} />
            <AttachRow icon="image-outline" label="Photo" hint="Depuis ta galerie" onPress={pickAndSendImage} />
            <AttachRow icon="film-outline" label="GIF" hint="Recherche Giphy" onPress={() => { setAttachOpen(false); setGifOpen(true); }} />
            <AttachRow icon="flame-outline" label="Proposer un défi" hint="Lance un match classé" onPress={() => { setAttachOpen(false); setChallengeOpen(true); }} />
          </SafeAreaView>
        </Pressable>
      ) : null}

      {/* Choix du format de défi */}
      {challengeOpen ? (
        <Pressable style={styles.overlay} onPress={() => setChallengeOpen(false)}>
          <SafeAreaView edges={['bottom']} style={styles.attachSheet}>
            <View style={styles.handle} />
            <ThemedText type="cardTitle" style={{ marginBottom: Spacing.two }}>
              Défier {otherName}
            </ThemedText>
            {CHALLENGE_FORMATS.map((f) => (
              <AttachRow
                key={f}
                icon="flame-outline"
                label={FORMAT_INFO[f].title}
                hint={FORMAT_INFO[f].detail}
                onPress={() => sendChallengeOfFormat(f)}
              />
            ))}
          </SafeAreaView>
        </Pressable>
      ) : null}

      <GifPicker visible={gifOpen} onClose={() => setGifOpen(false)} onSelect={sendGif} />
    </View>
  );
}

/**
 * Coches d'accusé façon WhatsApp, sur MES messages :
 *   ✓   (une, claire)  = envoyé        · read_at & delivered_at null
 *   ✓✓  (deux, claires) = reçu          · delivered_at posé
 *   ✓✓  (deux, bleues)  = lu            · read_at posé
 */
function MessageTicks({ message, onMedia }: { message: Message; onMedia?: boolean }) {
  const read = !!message.read_at;
  const delivered = read || !!message.delivered_at;
  return (
    <View style={[styles.ticks, onMedia && styles.ticksOnMedia]}>
      <Ionicons
        name={delivered ? 'checkmark-done' : 'checkmark'}
        size={15}
        color={read ? Palette.blue : 'rgba(245,246,243,0.7)'}
      />
    </View>
  );
}

function AttachRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.attachRow} onPress={onPress}>
      <View style={styles.attachIcon}>
        <Ionicons name={icon} size={22} color={Palette.evergreen} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="cardTitle">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Palette.grey} />
    </Pressable>
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
  media: { width: 200, height: 200, borderRadius: Radius.md, backgroundColor: Palette.white },
  ticks: { alignSelf: 'flex-end', marginTop: 2, marginBottom: -2 },
  ticksOnMedia: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.xs,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, paddingTop: Spacing.two },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', zIndex: 10 },
  attachSheet: {
    backgroundColor: Palette.whitePP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.border, marginBottom: Spacing.three },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  attachIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
