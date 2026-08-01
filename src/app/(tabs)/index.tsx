/**
 * Accueil = FEED SOCIAL GLOBAL (Figma « Ecran FEED »).
 * Montre les séances de TOUT LE MONDE (pas seulement les amis) + les résultats de matchs,
 * avec likes. La bannière « À confirmer » reste en tête (action critique).
 *
 * Liste virtualisée (FlatList) + données react-query (cache + refetch au focus). Les lignes sont
 * mémoïsées et reçoivent des callbacks stables → les likes ne re-rendent pas toute la liste.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { MatchScoreboard } from '@/components/match-scoreboard';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  useConfirmMatch,
  useDisputedToResolve,
  useDisputeMatch,
  usePendingToConfirm,
  type PendingMatch,
} from '@/lib/matches/confirm';
import { useMatchesFeed, useToggleMatchLike, type MatchFeedItem } from '@/lib/matches/feed';
import { useMyProfile } from '@/lib/players/profile';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useUnreadMessages } from '@/lib/social/messages';
import { useUnreadCount } from '@/lib/social/notifications';
import { confirm, notify } from '@/lib/ui/alert';
import { relativeDate } from '@/lib/ui/date';
import { formatDuration, useSessionsFeed, useToggleSessionLike, type SessionFeedItem } from '@/lib/training/sessions';

const TABS = ['Entraînements', 'Matchs'] as const;

function Separator() {
  return <View style={styles.separator} />;
}

const GALLERY_GAP = Spacing.sm; // espace entre 2 photos
const GALLERY_PEEK = 28; // portion de la photo suivante visible → invite au swipe

/**
 * Galerie photo d'une séance : 1 photo = pleine largeur ; plusieurs = carrousel horizontal
 * qui « snappe » sur chaque image (léger peek de la suivante) + pastilles de position.
 * Snap cross-plateforme : `snapToInterval` sur natif, `pagingEnabled` (CSS scroll-snap) sur web.
 */
function PhotoGallery({ urls }: { urls: string[] }) {
  const [w, setW] = useState(0);
  const [active, setActive] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width), []);

  // Une seule photo : plein cadre, pas de carrousel.
  if (urls.length === 1) {
    return (
      <View style={styles.photoFull}>
        <Image source={{ uri: urls[0] }} style={styles.photoFullImg} contentFit="cover" transition={200} />
      </View>
    );
  }

  const itemW = w > 0 ? w - GALLERY_PEEK : 0;
  const interval = itemW + GALLERY_GAP;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval > 0) setActive(Math.round(e.nativeEvent.contentOffset.x / interval));
  };

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToAlignment="start"
          // Natif : snap par intervalle (respecte la largeur d'item → peek). Web : scroll-snap CSS.
          snapToInterval={Platform.OS === 'web' ? undefined : interval}
          pagingEnabled={Platform.OS === 'web'}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.galleryContent}>
          {urls.map((u, i) => (
            <View key={`${u}-${i}`} style={[styles.photoFull, { width: itemW }]}>
              <Image source={{ uri: u }} style={styles.photoFullImg} contentFit="cover" transition={200} />
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.dots}>
        {urls.map((u, i) => (
          <View key={`${u}-${i}`} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

/** Carte d'une séance dans le feed. Mémoïsée : ne re-rend que si la séance change. */
const SessionRow = memo(function SessionRow({
  item: s,
  onToggleLike,
  onOpenSession,
  onOpenAuthor,
}: {
  item: SessionFeedItem;
  onToggleLike: (item: SessionFeedItem) => void;
  onOpenSession: (id: string) => void;
  onOpenAuthor: (id: string) => void;
}) {
  return (
    <Pressable style={styles.card} onPress={() => onOpenSession(s.id)}>
      {/* En-tête : auteur + date (aligné maquette) */}
      <Pressable style={styles.cardHead} onPress={() => onOpenAuthor(s.author.id)}>
        <Avatar name={s.author.name} size={36} uri={s.author.avatarUrl} color={Palette.purple} />
        <View style={{ flex: 1 }}>
          <ThemedText type="cardTitle" numberOfLines={1}>
            {s.author.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
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

      {/* Photos pleine largeur sous le contenu (maquette) : carrousel snap si plusieurs */}
      {s.photoUrls.length ? <PhotoGallery urls={s.photoUrls} /> : null}

      {/* Footer like/commentaire : gros boutons pilule (même config que l'écran Publication). */}
      <View style={styles.cardFoot}>
        <Pressable style={styles.footBtn} onPress={() => onToggleLike(s)} hitSlop={8}>
          <Ionicons
            name={s.liked ? 'heart' : 'heart-outline'}
            size={20}
            color={s.liked ? Palette.redInk : Palette.grey}
          />
          <ThemedText type="smallBold" themeColor={s.liked ? 'danger' : 'textSecondary'}>
            {s.likeCount > 0 ? `${s.likeCount} ace${s.likeCount > 1 ? 's' : ''}` : 'Ace'}
          </ThemedText>
        </Pressable>
        <Pressable style={styles.footBtn} onPress={() => onOpenSession(s.id)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={19} color={Palette.grey} />
          {s.commentCount > 0 ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {s.commentCount}
            </ThemedText>
          ) : null}
        </Pressable>
      </View>
    </Pressable>
  );
});

/** Scoreboard d'un match dans le feed. Mémoïsé : ne re-rend que si le match (ou myId) change. */
const MatchRow = memo(function MatchRow({
  item: m,
  myId,
  onToggleLike,
  onOpenMatch,
}: {
  item: MatchFeedItem;
  myId: string | undefined;
  onToggleLike: (item: MatchFeedItem) => void;
  onOpenMatch: (id: string) => void;
}) {
  // Match officiel FFTT : carte légère (V/D, pas de sets ni de social).
  if (m.kind === 'fftt') {
    const won = m.winnerIsA;
    return (
      <View style={styles.ffttCard}>
        <Avatar name={m.playerA.name} uri={m.playerA.avatarUrl} size={40} color={Palette.blue} />
        <View style={{ flex: 1 }}>
          <ThemedText type="cardTitle" numberOfLines={1}>
            {m.playerA.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            vs {m.playerB.name}
            {m.opponentRank ? ` · ${m.opponentRank}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            Officiel FFTT · {relativeDate(m.date)}
          </ThemedText>
        </View>
        <View style={[styles.resultPill, { backgroundColor: won ? Palette.lime : Palette.red }]}>
          <ThemedText type="smallBold" style={{ color: won ? Palette.evergreen : Palette.redInk }}>
            {won ? 'Victoire' : 'Défaite'}
          </ThemedText>
        </View>
      </View>
    );
  }
  return (
    <MatchScoreboard
      topName={m.playerA.id === myId ? 'Toi' : m.playerA.name}
      topAvatarUrl={m.playerA.avatarUrl}
      bottomName={m.playerB.id === myId ? 'Toi' : m.playerB.name}
      bottomAvatarUrl={m.playerB.avatarUrl}
      setScores={m.setScores}
      score={m.score}
      topWon={m.winnerIsA}
      ranked={m.ranked}
      format={m.format}
      date={m.date}
      likeCount={m.likeCount}
      liked={m.liked}
      commentCount={m.commentCount}
      onLike={() => onToggleLike(m)}
      onComment={() => onOpenMatch(m.id)}
      onPress={() => onOpenMatch(m.id)}
    />
  );
});

export default function FeedScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const myId = session?.user?.id;
  const [tab, setTab] = useState(0);
  const [limit, setLimit] = useState(30); // feed infini : grandit de +20 au scroll
  const [actingId, setActingId] = useState<string | null>(null);

  const profileQ = useMyProfile(myId);
  const sessionsQ = useSessionsFeed(myId, limit);
  const matchesQ = useMatchesFeed(myId, limit);
  const pendingQ = usePendingToConfirm(myId);
  const disputedQ = useDisputedToResolve(myId);
  const unreadQ = useUnreadCount();
  const unreadMsgQ = useUnreadMessages(myId);

  const sessionLike = useToggleSessionLike(myId ?? '');
  const matchLike = useToggleMatchLike(myId ?? '');
  const confirmMut = useConfirmMatch(myId ?? '');
  const disputeMut = useDisputeMatch(myId ?? '');
  const { mutate: mutateSessionLike } = sessionLike;
  const { mutate: mutateMatchLike } = matchLike;

  // Rafraîchit chaque query au focus d'écran ; no-op réseau tant qu'elle est encore fraîche.
  useRefreshOnFocus(profileQ.refetch);
  useRefreshOnFocus(sessionsQ.refetch);
  useRefreshOnFocus(matchesQ.refetch);
  useRefreshOnFocus(pendingQ.refetch);
  useRefreshOnFocus(disputedQ.refetch);
  useRefreshOnFocus(unreadQ.refetch);
  useRefreshOnFocus(unreadMsgQ.refetch);

  const profile = profileQ.data ?? null;
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const matches = matchesQ.data ?? [];
  const pending = pendingQ.data ?? [];
  const disputed = disputedQ.data ?? [];
  const unread = unreadQ.data ?? 0;
  const unreadMsg = unreadMsgQ.data ?? 0;

  async function onConfirm(m: PendingMatch) {
    try {
      setActingId(m.id);
      const r = await confirmMut.mutateAsync(m.id);
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
      message: `Le match contre ${m.proposerName} sera marqué comme contesté (aucun ELO). Attention : 3 contestations max par compte, et sans réponse sous 48 h le score est accepté automatiquement.`,
      confirmText: 'Contester',
      destructive: true,
    });
    if (!ok) return;
    try {
      setActingId(m.id);
      await disputeMut.mutateAsync(m.id);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setActingId(null);
    }
  }

  // Callbacks STABLES (mutate est stable en react-query) → les lignes mémoïsées tiennent.
  const toggleLike = useCallback((item: SessionFeedItem) => { if (myId) mutateSessionLike(item); }, [myId, mutateSessionLike]);
  const toggleLikeMatch = useCallback((item: MatchFeedItem) => { if (myId) mutateMatchLike(item); }, [myId, mutateMatchLike]);
  const openSession = useCallback((id: string) => router.push({ pathname: '/session', params: { id } }), []);
  const openAuthor = useCallback((id: string) => router.push({ pathname: '/player', params: { id } }), []);
  const openMatch = useCallback((id: string) => router.push({ pathname: '/match', params: { id } }), []);

  const name = profile?.display_name ?? 'Joueur';
  // Feed social : on ne montre pas ses propres séances (seulement celles des autres).
  const visibleSessions = useMemo(() => sessions.filter((s) => s.author.id !== myId), [sessions, myId]);
  const data: (SessionFeedItem | MatchFeedItem)[] = tab === 0 ? visibleSessions : matches;
  // Feed infini : on a rempli une page complète → il y a peut-être plus (on compte le brut fetché).
  const canLoadMore = (tab === 0 ? sessions.length : matches.length) >= limit;
  const loadingMore = canLoadMore && (tab === 0 ? sessionsQ.isFetching : matchesQ.isFetching);

  const renderItem = useCallback(
    ({ item }: { item: SessionFeedItem | MatchFeedItem }) => (
      <View style={styles.itemWrap}>
        {tab === 0 ? (
          <SessionRow item={item as SessionFeedItem} onToggleLike={toggleLike} onOpenSession={openSession} onOpenAuthor={openAuthor} />
        ) : (
          <MatchRow item={item as MatchFeedItem} myId={myId} onToggleLike={toggleLikeMatch} onOpenMatch={openMatch} />
        )}
      </View>
    ),
    [tab, myId, toggleLike, toggleLikeMatch, openSession, openAuthor, openMatch],
  );

  const header = (
    <>
      {/* Header marque (plein cadre) */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
        <Pressable style={styles.headerProfile} onPress={() => router.push('/profil' as Href)} hitSlop={8}>
          <Avatar name={name} size={48} color={Palette.purple} uri={profile?.avatar_url} />
          <View style={{ flex: 1 }}>
            <ThemedText type="title" numberOfLines={1}>
              {name}
            </ThemedText>
          </View>
        </Pressable>
        <View style={styles.headerIcons}>
          <Pressable onPress={() => router.push('/messages')} hitSlop={10}>
            <Icon name="forum" size={28} color={Palette.onyx} />
            {unreadMsg > 0 ? <View style={styles.badge} /> : null}
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10}>
            <Icon name="notifications" size={28} color={Palette.onyx} />
            {unread > 0 ? <View style={styles.badge} /> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.headerBody}>
        {/* À confirmer */}
        {pending.length > 0 ? (
          <View style={styles.pendingBlock}>
            <ThemedText type="sectionTitle" themeColor="textSecondary">
              À confirmer
            </ThemedText>
            {pending.map((m) => (
              <View key={m.id} style={styles.confirmCard}>
                <View style={styles.confirmTop}>
                  <Avatar name={m.proposerName} uri={m.proposerAvatar} size={40} color={Palette.blue} />
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

        {/* Contesté — re-proposer le bon score */}
        {disputed.length > 0 ? (
          <View style={styles.pendingBlock}>
            <ThemedText type="sectionTitle" themeColor="textSecondary">
              Contesté
            </ThemedText>
            {disputed.map((m) => (
              <View key={m.id} style={[styles.confirmCard, styles.disputedCard]}>
                <View style={styles.confirmTop}>
                  <Avatar name={m.opponentName} uri={m.opponentAvatar} size={40} color={Palette.red} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle">Score contesté · {m.opponentName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Bo{m.bestOf} · score proposé {m.myScore} · re-propose le bon
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  style={[styles.cBtn, styles.cConfirm]}
                  onPress={() =>
                    router.push({
                      pathname: '/new-match',
                      params: {
                        opponentId: m.opponentId,
                        opponentName: m.opponentName,
                        opponentAvatar: m.opponentAvatar ?? '',
                        format: `bo${m.bestOf}`, // format d'origine → figé (on ne change pas le format en corrigeant)
                        disputeMatchId: m.id, // réutilise le match contesté au lieu d'en créer un doublon
                      },
                    })
                  }>
                  <ThemedText type="smallBold" themeColor="onBrand">
                    Proposer le bon score
                  </ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Onglets */}
        <View style={styles.tabs}>
          {TABS.map((t, i) => (
            <Pressable
              key={t}
              onPress={() => {
                setTab(i);
                setLimit(30); // reset la pagination en changeant d'onglet
              }}
              style={[styles.tab, tab === i ? styles.tabOn : styles.tabOff]}>
              <ThemedText type="smallBold" themeColor={tab === i ? 'onBrand' : 'textSecondary'}>
                {t}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (canLoadMore) setLimit((l) => l + 20);
        }}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.feedMore} color={Palette.grey} /> : null}
        ListEmptyComponent={
          <View style={styles.itemWrap}>
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                {tab === 0 ? 'Aucune séance pour l’instant. Note la tienne ! 🏓' : 'Aucun match pour l’instant. Lance un défi ! 🏓'}
              </ThemedText>
            </View>
          </View>
        }
      />

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerIcons: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.redInk },

  headerBody: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.three },
  pendingBlock: { gap: Spacing.two },
  itemWrap: { paddingHorizontal: Spacing.four },

  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
  tabOn: { backgroundColor: Palette.ink2 },
  tabOff: { backgroundColor: Palette.white },

  separator: { height: Spacing.md },
  feedMore: { marginVertical: Spacing.four },
  empty: { backgroundColor: Palette.white, borderRadius: Radius.sm, padding: Spacing.four },

  card: {
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  ffttCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  resultPill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardBody: { gap: Spacing.half },
  photoFull: { width: '100%', aspectRatio: 16 / 10, borderRadius: Radius.xs, backgroundColor: Palette.whitePP, overflow: 'hidden' },
  photoFullImg: { ...StyleSheet.absoluteFillObject },
  galleryContent: { gap: GALLERY_GAP, paddingRight: GALLERY_PEEK },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.border },
  dotActive: { backgroundColor: Palette.onyx, width: 18 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tag: { backgroundColor: Palette.whitePP, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
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

  confirmCard: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.blue,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  disputedCard: { borderColor: Palette.red },
  confirmTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  confirmActions: { flexDirection: 'row', gap: Spacing.two },
  cBtn: { flex: 1, height: 44, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  cDispute: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cConfirm: { backgroundColor: Palette.onyx },

  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.onyx,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
