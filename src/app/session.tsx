/**
 * Détail d'une publication du feed (une séance) : la séance, QUI a aimé,
 * et le fil des commentaires avec saisie en bas (façon chat).
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  addSessionComment,
  fetchSessionComments,
  fetchSessionItem,
  formatDuration,
  likeSession,
  likeSessionComment,
  unlikeSession,
  unlikeSessionComment,
  type SessionComment,
  type SessionFeedItem,
} from '@/lib/training/sessions';

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function openProfile(id: string) {
  if (id) router.push({ pathname: '/player', params: { id } });
}

/** Galerie de photos de séance : 1 photo = simple image, plusieurs = carrousel paginé + points. */
function PhotoGallery({ uris }: { uris: string[] }) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);

  if (uris.length === 1) {
    return <Image source={{ uri: uris[0] }} style={styles.photoFull} contentFit="cover" transition={200} />;
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => width > 0 && setActive(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {uris.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            style={[styles.photoFull, width ? { width } : null]}
            contentFit="cover"
            transition={200}
          />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {uris.map((uri, i) => (
          <View key={uri} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [item, setItem] = useState<SessionFeedItem | null>(null);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([fetchSessionItem(id, myId), fetchSessionComments(id, myId)]).then(([it, cm]) => {
      setItem(it);
      setComments(cm);
      setLoading(false);
    });
  }, [id, myId]);

  /** Ace optimiste sur un commentaire : maj immédiate de l'état, rollback si l'appel échoue. */
  async function toggleCommentLike(c: SessionComment) {
    if (!myId) return;
    const liked = !c.liked;
    setComments((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, liked, likeCount: x.likeCount + (liked ? 1 : -1) } : x)),
    );
    try {
      if (liked) await likeSessionComment(c.id, myId);
      else await unlikeSessionComment(c.id, myId);
    } catch {
      setComments((prev) => prev.map((x) => (x.id === c.id ? c : x))); // rollback
    }
  }

  useEffect(load, [load]);

  async function toggleLike() {
    if (!myId || !item || !id) return;
    const liked = !item.liked;
    setItem({ ...item, liked, likeCount: item.likeCount + (liked ? 1 : -1) });
    try {
      if (liked) await likeSession(id, myId);
      else await unlikeSession(id, myId);
    } catch {
      setItem({ ...item });
    }
  }

  async function send() {
    if (!myId || !id || !text.trim() || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      await addSessionComment(id, myId, body);
      setComments(await fetchSessionComments(id, myId));
      setItem((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Publication</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.onyx} />
            </View>
          ) : !item ? (
            <View style={styles.center}>
              <ThemedText type="default" themeColor="textSecondary">
                Publication introuvable.
              </ThemedText>
            </View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* La séance */}
              <View style={styles.card}>
                <Pressable style={styles.cardHead} onPress={() => openProfile(item.author.id)}>
                  <Avatar name={item.author.name} size={40} uri={item.author.avatarUrl} color={Palette.purple} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle" numberOfLines={1}>
                      {item.author.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {relativeDate(item.createdAt)}
                    </ThemedText>
                  </View>
                </Pressable>

                <View style={styles.cardBody}>
                  <ThemedText type="cardTitle">
                    {item.isSolo ? 'Séance solo' : 'Séance'}
                    {item.strokes.length ? ` · ${item.strokes[0]}` : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDuration(item.durationMin)}
                    {item.venueName ? ` · ${item.venueName}` : ''}
                    {item.feeling ? ` · ${item.feeling}` : ''}
                  </ThemedText>
                  {item.note ? (
                    <ThemedText type="default" style={{ marginTop: Spacing.half }}>
                      {item.note}
                    </ThemedText>
                  ) : null}
                </View>

                {item.strokes.length ? (
                  <View style={styles.tagsRow}>
                    {item.strokes.map((st) => (
                      <View key={st} style={styles.tag}>
                        <ThemedText type="small" themeColor="brand">
                          {st}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}

                {item.photoUrls.length ? <PhotoGallery uris={item.photoUrls} /> : null}

                {/* Compteurs : « N aces » cliquable (ouvre la liste des likers) + « N commentaires ». */}
                <View style={styles.countsRow}>
                  <Pressable
                    onPress={() => item.likeCount > 0 && router.push(`/aces?kind=session&id=${id}` as Href)}
                    disabled={item.likeCount === 0}
                    hitSlop={8}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.likeCount} ace{item.likeCount > 1 ? 's' : ''}
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.commentCount} commentaire{item.commentCount > 1 ? 's' : ''}
                  </ThemedText>
                </View>

                {/* Gros boutons pilule. Ace = like ; Commenter → va à la saisie en bas. */}
                <View style={styles.cardFoot}>
                  <Pressable style={styles.footBtn} onPress={toggleLike} hitSlop={8}>
                    <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={20} color={item.liked ? Palette.redInk : Palette.grey} />
                    <ThemedText type="smallBold" themeColor={item.liked ? 'danger' : 'textSecondary'}>
                      Ace
                    </ThemedText>
                  </Pressable>
                  <Pressable style={styles.footBtn} onPress={() => scrollRef.current?.scrollToEnd({ animated: true })} hitSlop={8}>
                    <Ionicons name="chatbubble-outline" size={19} color={Palette.grey} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      Commenter
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              {/* Commentaires */}
              <View style={styles.section}>
                <ThemedText type="sectionTitle" themeColor="textSecondary">
                  Commentaires{comments.length ? ` · ${comments.length}` : ''}
                </ThemedText>
                {comments.length === 0 ? (
                  <ThemedText type="small" themeColor="textMuted">
                    Aucun commentaire. Sois le premier !
                  </ThemedText>
                ) : (
                  comments.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <Pressable onPress={() => openProfile(c.author.id)}>
                        <Avatar name={c.author.name} size={36} uri={c.author.avatarUrl} color={Palette.purple} />
                      </Pressable>
                      <View style={styles.commentBubble}>
                        <View style={styles.commentTop}>
                          <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                            {c.author.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textMuted">
                            {relativeDate(c.createdAt)}
                          </ThemedText>
                        </View>
                        <ThemedText type="default">{c.body}</ThemedText>
                      </View>
                      {/* Ace du commentaire (pouce + compteur) */}
                      <Pressable testID="comment-ace" style={styles.commentAce} onPress={() => toggleCommentLike(c)} hitSlop={8}>
                        <Ionicons name={c.liked ? 'heart' : 'heart-outline'} size={18} color={c.liked ? Palette.redInk : Palette.grey} />
                        {c.likeCount > 0 ? (
                          <ThemedText type="small" themeColor={c.liked ? 'danger' : 'textMuted'}>
                            {c.likeCount}
                          </ThemedText>
                        ) : null}
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {item ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor={Palette.grey}
                value={text}
                onChangeText={setText}
                onSubmitEditing={send}
                multiline
              />
              <Pressable testID="comment-send" style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]} onPress={send} disabled={!text.trim() || sending}>
                {sending ? <ActivityIndicator color={Palette.whitePP} size="small" /> : <Ionicons name="arrow-up" size={22} color={Palette.whitePP} />}
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardBody: { gap: Spacing.half },
  photoFull: { width: '100%', height: 220, borderRadius: Radius.sm, backgroundColor: Palette.whitePP },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.border },
  dotActive: { backgroundColor: Palette.onyx, width: 18 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tag: { backgroundColor: Palette.whitePP, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.one },
  footBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.whitePP,
    borderRadius: Radius.sm,
    paddingVertical: 10,
  },

  section: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  countsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  commentAce: { alignItems: 'center', justifyContent: 'flex-start', gap: 2, paddingTop: Spacing.one, minWidth: 24 },
  commentBubble: {
    flex: 1,
    backgroundColor: Palette.whitePP,
    borderRadius: Radius.sm,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  commentTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.border },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: Radius.md,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Palette.onyx, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: Palette.grey },
});
