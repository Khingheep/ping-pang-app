/**
 * Accueil = FEED SOCIAL GLOBAL (Figma « Ecran FEED »).
 * Montre les séances de TOUT LE MONDE (pas seulement les amis) + les résultats de matchs,
 * avec likes. La bannière « À confirmer » reste en tête (action critique).
 */

import { Ionicons } from '@expo/vector-icons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { MatchScoreboard } from '@/components/match-scoreboard';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { confirmMatch, disputeMatch, fetchPendingToConfirm, type PendingMatch } from '@/lib/matches/confirm';
import { fetchRecentMatches, type MatchView } from '@/lib/matches/history';
import { likeMatch, unlikeMatch } from '@/lib/matches/social';
import { fetchMyProfile, type PlayerProfile } from '@/lib/players/profile';
import { unreadCount } from '@/lib/social/notifications';
import { confirm, notify } from '@/lib/ui/alert';
import {
  fetchSessionsFeed,
  formatDuration,
  likeSession,
  unlikeSession,
  type SessionFeedItem,
} from '@/lib/training/sessions';

const TABS = ['Entraînements', 'Matchs'] as const;

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function FeedScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const myId = session?.user?.id;
  const [tab, setTab] = useState(0);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [sessions, setSessions] = useState<SessionFeedItem[]>([]);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [unread, setUnread] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!myId) return;
    fetchMyProfile(myId).then(setProfile);
    fetchSessionsFeed(myId, 40).then(setSessions);
    fetchRecentMatches(myId, 40).then(setMatches);
    fetchPendingToConfirm(myId).then(setPending);
    unreadCount().then(setUnread);
  }, [myId]);

  useFocusEffect(load);

  async function onConfirm(m: PendingMatch) {
    try {
      setActingId(m.id);
      const r = await confirmMatch(m.id);
      load();
      router.push({
        pathname: '/post-match',
        params: { matchId: m.id, won: String(r.won), delta: String(r.delta_me), opponentName: m.proposerName, score: m.myScore },
      });
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setActingId(null);
    }
  }

  async function onDispute(m: PendingMatch) {
    const ok = await confirm({
      title: 'Contester le score ?',
      message: `Le match contre ${m.proposerName} sera marqué comme contesté (aucun ELO).`,
      confirmText: 'Contester',
      destructive: true,
    });
    if (!ok) return;
    try {
      setActingId(m.id);
      await disputeMatch(m.id);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setActingId(null);
    }
  }

  async function toggleLike(item: SessionFeedItem) {
    if (!myId) return;
    const liked = !item.liked;
    // optimiste
    setSessions((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, liked, likeCount: s.likeCount + (liked ? 1 : -1) } : s)),
    );
    try {
      if (liked) await likeSession(item.id, myId);
      else await unlikeSession(item.id, myId);
    } catch {
      // rollback en cas d'échec réseau
      setSessions((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, liked: !liked, likeCount: s.likeCount + (liked ? -1 : 1) } : s)),
      );
    }
  }

  async function toggleLikeMatch(item: MatchView) {
    if (!myId) return;
    const liked = !item.liked;
    // optimiste
    setMatches((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, liked, likeCount: m.likeCount + (liked ? 1 : -1) } : m)),
    );
    try {
      if (liked) await likeMatch(item.id, myId);
      else await unlikeMatch(item.id, myId);
    } catch {
      // rollback réseau
      setMatches((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, liked: !liked, likeCount: m.likeCount + (liked ? -1 : 1) } : m)),
      );
    }
  }

  const name = profile?.display_name ?? 'Joueur';
  // Feed social : on ne montre pas ses propres séances (seulement celles des autres).
  const visibleSessions = sessions.filter((s) => s.author.id !== myId);
  // Onglet « Matchs » : mes matchs confirmés, avec le détail des manches.
  const visibleMatches = matches.filter((m) => m.status === 'confirmed');

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={styles.scroll}>
        {/* Header marque */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
          <Pressable style={styles.headerProfile} onPress={() => router.push('/profile' as Href)} hitSlop={8}>
            <Avatar name={name} size={48} color={Palette.purple} uri={profile?.avatar_url} />
            <View style={{ flex: 1 }}>
              <ThemedText type="cardTitle" themeColor="onBrand" numberOfLines={1}>
                {name}
              </ThemedText>
              <ThemedText type="small" style={{ color: Palette.lime }}>
                {profile?.elo ?? 1200} pts
              </ThemedText>
            </View>
          </Pressable>
          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push('/messages')} hitSlop={10}>
              <Ionicons name="chatbubble-outline" size={22} color={Palette.whitePP} />
            </Pressable>
            <Pressable onPress={() => router.push('/notifications')} hitSlop={10}>
              <Ionicons name="notifications-outline" size={22} color={Palette.whitePP} />
              {unread > 0 ? <View style={styles.badge} /> : null}
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          {/* À confirmer */}
          {pending.length > 0 ? (
            <View style={{ gap: Spacing.two, marginBottom: Spacing.two }}>
              <ThemedText type="sectionTitle" themeColor="textSecondary">
                À confirmer
              </ThemedText>
              {pending.map((m) => (
                <View key={m.id} style={styles.confirmCard}>
                  <View style={styles.confirmTop}>
                    <Avatar name={m.proposerName} size={40} color={Palette.blue} />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="cardTitle">{m.proposerName} a saisi un match</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {m.isRanked ? 'Classé' : 'Amical'} · Bo{m.bestOf} · ton score {m.myScore}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.confirmActions}>
                    <Pressable style={[styles.cBtn, styles.cDispute]} disabled={actingId === m.id} onPress={() => onDispute(m)}>
                      <ThemedText type="smallBold" themeColor="text">
                        Contester
                      </ThemedText>
                    </Pressable>
                    <Pressable style={[styles.cBtn, styles.cConfirm]} disabled={actingId === m.id} onPress={() => onConfirm(m)}>
                      {actingId === m.id ? (
                        <ActivityIndicator color={Palette.whitePP} size="small" />
                      ) : (
                        <ThemedText type="smallBold" themeColor="onBrand">
                          Confirmer {m.myScore}
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Onglets */}
          <View style={styles.tabs}>
            {TABS.map((t, i) => (
              <Pressable key={t} onPress={() => setTab(i)} style={[styles.tab, tab === i ? styles.tabOn : styles.tabOff]}>
                <ThemedText type="smallBold" themeColor={tab === i ? 'onBrand' : 'text'}>
                  {t}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* Entraînements */}
          {tab === 0 ? (
            visibleSessions.length === 0 ? (
              <View style={styles.empty}>
                <ThemedText type="default" themeColor="textSecondary">
                  Aucune séance pour l’instant. Note la tienne ! 🏓
                </ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {visibleSessions.map((s) => (
                  <Pressable key={s.id} style={styles.card} onPress={() => router.push({ pathname: '/session', params: { id: s.id } })}>
                    <View style={styles.cardRow}>
                      {/* Colonne gauche : contenu texte */}
                      <View style={styles.cardCol}>
                        <Pressable style={styles.cardHead} onPress={() => router.push({ pathname: '/player', params: { id: s.author.id } })}>
                          <Avatar name={s.author.name} size={36} uri={s.author.avatarUrl} color={Palette.purple} />
                          <View style={{ flex: 1 }}>
                            <ThemedText type="cardTitle" numberOfLines={1}>
                              {s.author.name}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {relativeDate(s.createdAt)}
                            </ThemedText>
                          </View>
                        </Pressable>

                        <View style={styles.cardBody}>
                          <ThemedText type="cardTitle" numberOfLines={2}>
                            {s.isSolo ? 'Séance solo' : 'Séance'}
                            {s.strokes.length ? ` · ${s.strokes[0]}` : ''}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {formatDuration(s.durationMin)}
                            {s.venueName ? ` · ${s.venueName}` : ''}
                            {s.feeling ? ` · ${s.feeling}` : ''}
                          </ThemedText>
                          {s.note ? (
                            <ThemedText type="default" numberOfLines={2} style={{ marginTop: Spacing.half }}>
                              {s.note}
                            </ThemedText>
                          ) : null}
                        </View>

                        {s.strokes.length ? (
                          <View style={styles.tagsRow}>
                            {s.strokes.slice(0, 3).map((st) => (
                              <View key={st} style={styles.tag}>
                                <ThemedText type="small" themeColor="brand">
                                  {st}
                                </ThemedText>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        <View style={styles.cardFoot}>
                          <Pressable style={styles.likeBtn} onPress={() => toggleLike(s)} hitSlop={8}>
                            <Ionicons
                              name={s.liked ? 'heart' : 'heart-outline'}
                              size={20}
                              color={s.liked ? Palette.redInk : Palette.grey}
                            />
                            <ThemedText type="smallBold" themeColor={s.liked ? 'danger' : 'textSecondary'}>
                              {s.likeCount > 0 ? s.likeCount : "J'aime"}
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            style={styles.likeBtn}
                            onPress={() => router.push({ pathname: '/session', params: { id: s.id } })}
                            hitSlop={8}>
                            <Ionicons name="chatbubble-outline" size={19} color={Palette.grey} />
                            {s.commentCount > 0 ? (
                              <ThemedText type="smallBold" themeColor="textSecondary">
                                {s.commentCount}
                              </ThemedText>
                            ) : null}
                          </Pressable>
                        </View>
                      </View>

                      {/* Colonne droite : photo (la 1re, + badge s'il y en a plusieurs) */}
                      {s.photoUrls.length ? (
                        <View style={styles.photoSide}>
                          <Image source={{ uri: s.photoUrls[0] }} style={styles.photoSideImg} contentFit="cover" transition={200} />
                          {s.photoUrls.length > 1 ? (
                            <View style={styles.photoCountBadge}>
                              <Ionicons name="images-outline" size={12} color={Palette.whitePP} />
                              <ThemedText type="smallBold" themeColor="onBrand">
                                {s.photoUrls.length}
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            )
          ) : null}

          {/* Matchs */}
          {tab === 1 ? (
            visibleMatches.length === 0 ? (
              <View style={styles.empty}>
                <ThemedText type="default" themeColor="textSecondary">
                  Aucun match pour l’instant. Lance un défi ! 🏓
                </ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {visibleMatches.map((m) => (
                  <MatchScoreboard
                    key={m.id}
                    opponent={m.opponent}
                    meName={name}
                    meAvatarUrl={profile?.avatar_url}
                    setScores={m.setScores}
                    score={m.score}
                    won={m.won}
                    delta={m.delta}
                    ranked={m.ranked}
                    format={m.format}
                    date={m.date}
                    likeCount={m.likeCount}
                    liked={m.liked}
                    commentCount={m.commentCount}
                    onLike={() => toggleLikeMatch(m)}
                    onComment={() => router.push({ pathname: '/match', params: { id: m.id } })}
                    onPress={() => router.push({ pathname: '/match', params: { id: m.id } })}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>

      {/* FAB ajouter une séance */}
      <Pressable style={[styles.fab, { bottom: BottomTabInset + Spacing.three }]} onPress={() => router.push('/new-training')}>
        <Ionicons name="add" size={28} color={Palette.whitePP} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  scroll: { paddingBottom: BottomTabInset + Spacing.six },
  header: {
    backgroundColor: Palette.evergreen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerIcons: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.redInk },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },

  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  tabOn: { backgroundColor: Palette.evergreen },
  tabOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },

  list: { gap: Spacing.two },
  empty: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, borderRadius: Radius.sm, padding: Spacing.four },

  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  cardRow: { flexDirection: 'row', gap: Spacing.three },
  cardCol: { flex: 1, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardBody: { gap: Spacing.half },
  photoSide: { width: 132, alignSelf: 'stretch', minHeight: 132, borderRadius: Radius.sm, backgroundColor: Palette.whitePP, overflow: 'hidden' },
  photoSideImg: { width: '100%', height: '100%' },
  photoCountBadge: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tag: { backgroundColor: Palette.whitePP, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.border, paddingTop: Spacing.two },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },

  confirmCard: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.blue,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  confirmTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  confirmActions: { flexDirection: 'row', gap: Spacing.two },
  cBtn: { flex: 1, height: 44, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  cDispute: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cConfirm: { backgroundColor: Palette.evergreen },

  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.onyx,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
