/**
 * Détail d'un match : le scoreboard set par set, QUI a aimé, et le fil des
 * commentaires avec saisie en bas (façon chat). Calqué sur l'écran « séance ».
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { MatchScoreboard } from '@/components/match-scoreboard';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchMatchFeedItem, type MatchFeedItem } from '@/lib/matches/feed';
import {
  addMatchComment,
  fetchMatchComments,
  fetchMatchLikers,
  likeMatch,
  unlikeMatch,
  type MatchComment,
  type MatchLiker,
} from '@/lib/matches/social';

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

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [item, setItem] = useState<MatchFeedItem | null>(null);
  const [likers, setLikers] = useState<MatchLiker[]>([]);
  const [comments, setComments] = useState<MatchComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([fetchMatchFeedItem(id, myId), fetchMatchLikers(id), fetchMatchComments(id)]).then(([it, lk, cm]) => {
      setItem(it);
      setLikers(lk);
      setComments(cm);
      setLoading(false);
    });
  }, [id, myId]);

  useEffect(load, [load]);

  async function toggleLike() {
    if (!myId || !item || !id) return;
    const liked = !item.liked;
    setItem({ ...item, liked, likeCount: item.likeCount + (liked ? 1 : -1) });
    try {
      if (liked) await likeMatch(id, myId);
      else await unlikeMatch(id, myId);
      setLikers(await fetchMatchLikers(id));
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
      await addMatchComment(id, myId, body);
      setComments(await fetchMatchComments(id));
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
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Match</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.evergreen} />
            </View>
          ) : !item ? (
            <View style={styles.center}>
              <ThemedText type="default" themeColor="textSecondary">
                Match introuvable.
              </ThemedText>
            </View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* Le scoreboard */}
              <MatchScoreboard
                topName={item.playerA.id === myId ? 'Toi' : item.playerA.name}
                topAvatarUrl={item.playerA.avatarUrl}
                bottomName={item.playerB.id === myId ? 'Toi' : item.playerB.name}
                bottomAvatarUrl={item.playerB.avatarUrl}
                setScores={item.setScores}
                score={item.score}
                topWon={item.winnerIsA}
                ranked={item.ranked}
                format={item.format}
                date={item.date}
                likeCount={item.likeCount}
                liked={item.liked}
                commentCount={item.commentCount}
                onLike={toggleLike}
              />

              {/* Qui a aimé */}
              {likers.length ? (
                <View style={styles.section}>
                  <ThemedText type="sectionTitle" themeColor="textSecondary">
                    Aimé par · {likers.length}
                  </ThemedText>
                  {likers.map((l) => (
                    <Pressable key={l.id} style={styles.personRow} onPress={() => openProfile(l.id)}>
                      <Avatar name={l.name} size={36} uri={l.avatarUrl} color={Palette.purple} />
                      <ThemedText type="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                        {l.name}
                      </ThemedText>
                      <Ionicons name="heart" size={16} color={Palette.redInk} />
                    </Pressable>
                  ))}
                </View>
              ) : null}

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
              <Pressable style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]} onPress={send} disabled={!text.trim() || sending}>
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

  section: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
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
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: Palette.grey },
});
