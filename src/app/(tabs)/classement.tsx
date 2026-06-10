import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/players/profile';

const FILTERS = ['Tous', 'France', 'Paris', 'Amis'];
const PODIUM = [
  { idx: 1, bg: Palette.blue, h: 150 },
  { idx: 0, bg: Palette.lime, h: 180 },
  { idx: 2, bg: Palette.purple, h: 140 },
];

export default function RankingScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const myId = session?.user?.id;

  useEffect(() => {
    fetchLeaderboard(100).then(setRows);
  }, []);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Ranking Mondial</ThemedText>

          <View style={styles.filters}>
            {FILTERS.map((f, i) => (
              <View key={f} style={[styles.pill, i === 0 ? styles.pillActive : styles.pillIdle]}>
                <ThemedText type="smallBold" themeColor={i === 0 ? 'onBrand' : 'text'}>
                  {f}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Podium */}
          <View style={styles.podium}>
            {PODIUM.map((p) => {
              const e = top3[p.idx];
              return (
                <View key={p.idx} style={[styles.podiumCol, { height: p.h, backgroundColor: p.bg }]}>
                  <ThemedText type="subtitle">#{p.idx + 1}</ThemedText>
                  <ThemedText type="cardTitle" style={styles.podiumName}>
                    {e?.display_name ?? '—'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {e ? e.elo : '—'}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          {/* Liste */}
          <View style={styles.list}>
            {rest.length === 0 && top3.length <= 3 ? null : null}
            {rest.map((e, i) => {
              const rank = i + 4;
              const mine = e.id === myId;
              return (
                <View key={e.id} style={[styles.row, mine && styles.rowMine]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rank}>
                    {rank}
                  </ThemedText>
                  <Avatar name={e.display_name} size={40} />
                  <View style={styles.rowMain}>
                    <ThemedText type="cardTitle">{e.display_name}</ThemedText>
                    {e.city ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {e.city}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="subtitle" themeColor="brand">
                    {e.elo}
                  </ThemedText>
                </View>
              );
            })}
            {rows.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary">
                Aucun joueur encore classé.
              </ThemedText>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  filters: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  pill: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.evergreen },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginTop: Spacing.five },
  podiumCol: { flex: 1, borderRadius: Radius.sm, padding: Spacing.three, justifyContent: 'flex-start', gap: Spacing.one },
  podiumName: { marginTop: 'auto' },
  list: { marginTop: Spacing.five, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowMine: { backgroundColor: Palette.lime, borderColor: Palette.lime },
  rank: { width: 24 },
  rowMain: { flex: 1 },
});
