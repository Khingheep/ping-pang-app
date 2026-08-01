/**
 * Onglet « Ranking » (Figma « Neo ») : filtres Tous/France/Paris/Amis, carte « Tu es classé Ne »
 * (le bouton flèche ancre/scrolle jusqu'à sa propre ligne), podium top 3 en BARRES (or/argent/
 * bronze) puis leaderboard. Chaque ligne montre la variation d'ELO sur 7 j : ▲ +N (vert) si
 * hausse, ▼ -N (rouge) si baisse, rien si stable. La ligne du joueur courant est surlignée lime.
 *
 * Données via react-query (RPC leaderboard_ranked = classement + delta) ; liste en FlatList.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { RankingExplainer } from '@/components/ranking-explainer';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { useLeaderboard, useMyProfile, type RankedEntry } from '@/lib/players/profile';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useFriendIds } from '@/lib/social/friends';

const FILTERS = ['Tous', 'France', 'Paris', 'Amis'] as const;

// Hauteur fixe d'une ligne (avatar 36 / 2 lignes de texte + padding 2×16) + séparateur 8.
// Constante → getItemLayout fiable + calcul d'offset exact pour l'animation d'ancrage.
const ROW_HEIGHT = 78;

// Ordre visuel du podium : #2 à gauche, #1 au centre (barre la plus haute), #3 à droite.
const PODIUM = [
  { slot: 1, rank: 2, bar: Palette.silver, barH: 96 },
  { slot: 0, rank: 1, bar: Palette.gold, barH: 148 },
  { slot: 2, rank: 3, bar: Palette.bronze, barH: 72 },
] as const;

/** Double chevron (SVG → identique natif/PWA) pour la tendance de classement. */
function MoveChevron({ up, color, size = 16 }: { up: boolean; color: string; size?: number }) {
  const d = up ? 'M5 12.5 L12 6 L19 12.5 M5 18.5 L12 12 L19 18.5' : 'M5 11.5 L12 18 L19 11.5 M5 5.5 L12 12 L19 5.5';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Tendance d'ELO d'une ligne : +N vert / -N rouge / rien si stable. */
function MoveTag({ delta }: { delta: number }) {
  if (!delta) return null;
  const up = delta > 0;
  const color = up ? Palette.greenInk : Palette.redInk;
  return (
    <View style={styles.moveTag}>
      <ThemedText type="smallBold" style={{ color }}>
        {up ? '+' : ''}
        {delta}
      </ThemedText>
      <MoveChevron up={up} color={color} />
    </View>
  );
}

export default function RankingScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;

  const profileQ = useMyProfile(myId);
  const leaderboardQ = useLeaderboard(200, 7);
  const friendsQ = useFriendIds(myId);

  const [filter, setFilter] = useState(0);
  const [podColW, setPodColW] = useState(0); // largeur d'une colonne de podium (mesurée)
  const listRef = useRef<FlatList<RankedEntry>>(null);
  const headerH = useRef(0); // hauteur du ListHeader (titre + filtres + carte + podium)
  const offsetY = useRef(0); // offset de scroll courant
  const scrollAnim = useRef(new Animated.Value(0)).current; // pilote l'anim « parcours des rangs »

  // Rafraîchit chaque query au focus d'écran ; no-op réseau tant qu'elle est encore fraîche.
  useRefreshOnFocus(profileQ.refetch);
  useRefreshOnFocus(leaderboardQ.refetch);
  useRefreshOnFocus(friendsQ.refetch);

  const profile = profileQ.data ?? null;
  const rows = useMemo(() => leaderboardQ.data ?? [], [leaderboardQ.data]);
  const friendIds = useMemo(() => friendsQ.data ?? [], [friendsQ.data]);

  const filtered = useMemo(
    () =>
      rows.filter((e) => {
        if (filter === 1) return e.country === 'France';
        if (filter === 2) return (e.city ?? '').toLowerCase().startsWith('paris');
        if (filter === 3) return e.id === myId || friendIds.includes(e.id);
        return true;
      }),
    [rows, filter, friendIds, myId],
  );

  // Podium = 3 premiers du filtre courant ; la liste démarre au 4e.
  const top3 = filtered.slice(0, 3);
  const restData = useMemo(() => filtered.slice(3), [filtered]);

  // Position du joueur dans le classement filtré (pour la carte + l'ancrage du bouton flèche).
  const myPos = filtered.findIndex((e) => e.id === myId); // 0-based, -1 si absent
  const myRank = myPos >= 0 ? myPos + 1 : 0;
  const elo = profile?.elo ?? (myPos >= 0 ? filtered[myPos].elo : 0);

  // Le bouton flèche « ancre » vers sa propre ligne, avec une animation qui PARCOURT les rangs
  // (défilement contrôlé, easing) plutôt qu'un saut brut. Top 3 → on remonte simplement en haut.
  const scrollToMe = useCallback(() => {
    if (myPos < 0) return;
    const restIndex = myPos - 3;
    const target =
      restIndex < 0 ? 0 : Math.max(0, headerH.current + restIndex * ROW_HEIGHT - Spacing.six); // ~1 ligne de marge en haut

    const from = offsetY.current;
    if (Math.abs(target - from) < 4) return; // déjà à destination

    scrollAnim.stopAnimation();
    scrollAnim.setValue(from);
    const sub = scrollAnim.addListener(({ value }) => listRef.current?.scrollToOffset({ offset: value, animated: false }));
    // Durée proportionnelle à la distance (plafonnée) → on « voit » les rangs défiler.
    const duration = Math.min(1700, 450 + Math.abs(target - from) * 0.55);
    Animated.timing(scrollAnim, { toValue: target, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(
      () => scrollAnim.removeListener(sub),
    );
  }, [myPos, scrollAnim]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    headerH.current = e.nativeEvent.layout.height;
  }, []);
  // Largeur d'une colonne = (largeur du podium − 2 gaps) / 3 → l'avatar remplit ensuite le pilier.
  const onPodiumLayout = useCallback((e: LayoutChangeEvent) => {
    setPodColW((e.nativeEvent.layout.width - 2 * Spacing.two) / 3);
  }, []);
  // Avatar = largeur intérieure du pilier (colonne − padding 8px de chaque côté). Fallback avant mesure.
  const avatarSize = podColW > 0 ? Math.round(podColW - 2 * Spacing.sm) : 56;

  const renderItem = useCallback(
    ({ item: e, index }: { item: RankedEntry; index: number }) => {
      const mine = e.id === myId;
      return (
        <Pressable
          onPress={() => router.push({ pathname: '/player', params: { id: e.id } })}
          style={[styles.row, mine && styles.rowMine]}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rank}>
            {index + 4}
          </ThemedText>
          <Avatar name={e.display_name} uri={e.avatar_url} size={36} />
          <View style={styles.rowMain}>
            <ThemedText type="cardTitle" numberOfLines={1}>
              {e.display_name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {e.elo}
            </ThemedText>
          </View>
          <MoveTag delta={e.delta} />
        </Pressable>
      );
    },
    [myId],
  );

  const header = (
    <>
      <ThemedText type="title">Ranking</ThemedText>

      {/* Filtres */}
      <View style={styles.filtersCard}>
        {FILTERS.map((f, i) => (
          <Pressable
            key={f}
            onPress={() => setFilter(i)}
            style={[styles.pill, filter === i ? styles.pillActive : styles.pillIdle]}>
            <ThemedText type="smallBold" themeColor={filter === i ? 'onBrand' : 'textSecondary'}>
              {f}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Carte « Tu es classé Ne » + ancrage vers sa ligne */}
      {myRank > 0 ? (
        <View style={styles.meRow}>
          <View style={styles.meCard}>
            <ThemedText type="cardTitle">Tu es classé {myRank}e</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {elo}
            </ThemedText>
          </View>
          <Pressable testID="rank-anchor" style={styles.meArrow} onPress={scrollToMe} hitSlop={6}>
            <Ionicons name="arrow-forward" size={24} color={Palette.whitePP} />
          </Pressable>
        </View>
      ) : null}

      {/* Podium top 3 en barres */}
      {top3.length > 0 ? (
        <View style={styles.podiumCard}>
          <View style={styles.podium} onLayout={onPodiumLayout}>
            {PODIUM.map(({ slot, rank, bar, barH }) => {
              const e = top3[slot];
              if (!e) return <View key={rank} style={styles.podiumSpacer} />;
              return (
                <Pressable
                  key={rank}
                  style={styles.podCol}
                  onPress={() => router.push({ pathname: '/player', params: { id: e.id } })}>
                  <View style={styles.podTrack}>
                    <Avatar name={e.display_name} uri={e.avatar_url} size={avatarSize} />
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.podName}>
                      {e.display_name}
                    </ThemedText>
                    <ThemedText type="cardTitle" numberOfLines={1}>
                      {e.elo}
                    </ThemedText>
                    <View style={[styles.podBar, { height: barH, backgroundColor: bar }]}>
                      <ThemedText type="metric" style={styles.podRank}>
                        {rank}
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <RankingExplainer />
    </>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <FlatList
          ref={listRef}
          data={restData}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={<View onLayout={onHeaderLayout}>{header}</View>}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          ListEmptyComponent={
            filtered.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
                {filter === 3 ? 'Aucun ami pour l’instant.' : 'Aucun joueur pour ce filtre.'}
              </ThemedText>
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },

  filtersCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: Palette.white,
    borderRadius: Radius.pill,
    padding: Spacing.one,
    marginTop: Spacing.three,
  },
  pill: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.pill, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.ink2 },
  pillIdle: { backgroundColor: 'transparent' },

  // Carte « Tu es classé Ne » + bouton d'ancrage
  meRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
  meCard: { flex: 1, justifyContent: 'center', backgroundColor: Palette.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  meArrow: { width: 64, borderRadius: Radius.sm, backgroundColor: Palette.onyx, alignItems: 'center', justifyContent: 'center' },

  // Podium barres
  podiumCard: {
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  podCol: { flex: 1 },
  podTrack: {
    backgroundColor: Palette.border, // #E5E5E5 (background secondary) → se détache du fond de page
    borderTopLeftRadius: Radius.pill, // dôme arrondi 999px
    borderTopRightRadius: Radius.pill,
    alignItems: 'center',
    padding: Spacing.sm, // padding interne 8px
    gap: Spacing.half,
  },
  podName: { marginTop: Spacing.one },
  podBar: { alignSelf: 'stretch', marginTop: Spacing.two, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  podRank: { color: Palette.white, fontSize: 28, lineHeight: 34 },
  podiumSpacer: { flex: 1 },

  separator: { height: Spacing.two },
  empty: { marginTop: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    overflow: 'hidden',
  },
  rowMine: { backgroundColor: Palette.lime },
  rank: { width: 22 },
  rowMain: { flex: 1 },
  moveTag: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
});
