/**
 * Onglet « Ranking Mondial » (Figma « Neo ») : podium top 3 (blocs colorés) + leaderboard
 * filtrable Tous/France/Paris/Amis. La ligne du joueur courant est surlignée lime.
 * Le rang/ELO/delta 7 j reste affiché en résumé sous le titre (aucune perte de donnée).
 *
 * Données via react-query (cache + refetch au focus) ; liste virtualisée en FlatList.
 */

import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEloDelta, useLeaderboard, useMyProfile, type LeaderboardEntry } from '@/lib/players/profile';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useFriendIds } from '@/lib/social/friends';

const FILTERS = ['Tous', 'France', 'Paris', 'Amis'] as const;

// Ordre visuel du podium : #2 à gauche, #1 au centre (surélevé), #3 à droite.
const PODIUM = [
  { slot: 1, rank: 2, bg: Palette.blue, height: 150 },
  { slot: 0, rank: 1, bg: Palette.lime, height: 180 },
  { slot: 2, rank: 3, bg: Palette.purple, height: 150 },
] as const;

function Separator() {
  return <View style={styles.separator} />;
}

export default function RankingScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;

  const profileQ = useMyProfile(myId);
  const leaderboardQ = useLeaderboard(200);
  const friendsQ = useFriendIds(myId);
  const delta7Q = useEloDelta(myId, 7);

  const [filter, setFilter] = useState(0);

  // Rafraîchit chaque query au focus d'écran ; no-op réseau tant qu'elle est encore fraîche.
  useRefreshOnFocus(profileQ.refetch);
  useRefreshOnFocus(leaderboardQ.refetch);
  useRefreshOnFocus(friendsQ.refetch);
  useRefreshOnFocus(delta7Q.refetch);

  const profile = profileQ.data ?? null;
  const rows = useMemo(() => leaderboardQ.data ?? [], [leaderboardQ.data]);
  const friendIds = useMemo(() => friendsQ.data ?? [], [friendsQ.data]);

  const myRank = rows.findIndex((r) => r.id === myId) + 1;
  const elo = profile?.elo ?? 0;
  const delta7 = delta7Q.data ?? 0;

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

  const renderItem = useCallback(
    ({ item: e, index }: { item: LeaderboardEntry; index: number }) => {
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
            {e.city ? (
              <ThemedText type="small" themeColor="textSecondary">
                {e.city}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="subtitle" themeColor="brand">
            {e.elo}
          </ThemedText>
        </Pressable>
      );
    },
    [myId],
  );

  const header = (
    <>
      <ThemedText type="title">Ranking Mondial</ThemedText>

      {myRank > 0 ? (
        <View style={styles.meLine}>
          <ThemedText type="small" themeColor="textSecondary">
            #{myRank} mondial · ELO {elo}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: delta7 >= 0 ? Palette.onyx : Palette.redInk }}>
            {delta7 >= 0 ? '▲ +' : '▼ '}
            {delta7} (7j)
          </ThemedText>
        </View>
      ) : null}

      {/* Filtres */}
      <View style={styles.filters}>
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

      {/* Podium top 3 */}
      {top3.length > 0 ? (
        <View style={styles.podium}>
          {PODIUM.map(({ slot, rank, bg, height }) => {
            const e = top3[slot];
            if (!e) return <View key={rank} style={styles.podiumSpacer} />;
            return (
              <Pressable
                key={rank}
                style={[styles.podiumCell, { backgroundColor: bg, height }]}
                onPress={() => router.push({ pathname: '/player', params: { id: e.id } })}>
                <ThemedText type="subtitle">#{rank}</ThemedText>
                <View style={styles.podiumBody}>
                  <Avatar name={e.display_name} uri={e.avatar_url} size={40} />
                  <ThemedText type="cardTitle" numberOfLines={1}>
                    {e.display_name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {e.elo}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <FlatList
          data={restData}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={header}
          ItemSeparatorComponent={Separator}
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

  meLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },

  filters: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four, marginBottom: Spacing.two },
  pill: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.pill, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.ink2 },
  pillIdle: { backgroundColor: 'transparent' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginTop: Spacing.three, marginBottom: Spacing.two },
  podiumCell: { flex: 1, borderRadius: Radius.sm, padding: Spacing.three, justifyContent: 'space-between' },
  podiumBody: { gap: Spacing.half, marginTop: Spacing.two },
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
});
