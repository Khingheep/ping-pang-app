/**
 * Onglet ELO-RANKING — carte « Mon classement » (ELO + delta 7 jours)
 * + leaderboard filtrable Monde/France/Paris/Amis.
 *
 * Re-skin du Figma « ELO-RANKING » dans notre thème clair vert/blanc.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchRecentMatches, last7Delta, type MatchView } from '@/lib/matches/history';
import { fetchLeaderboard, fetchMyProfile, type LeaderboardEntry, type PlayerProfile } from '@/lib/players/profile';
import { fetchFriendIds } from '@/lib/social/friends';

const FILTERS = ['Monde', 'France', 'Paris', 'Amis'] as const;

export default function RankingScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [filter, setFilter] = useState(0);
  const [matches, setMatches] = useState<MatchView[]>([]);

  const load = useCallback(() => {
    if (!myId) return;
    fetchMyProfile(myId).then(setProfile);
    fetchLeaderboard(200).then(setRows);
    fetchFriendIds(myId).then(setFriendIds);
    fetchRecentMatches(myId, 100).then(setMatches);
  }, [myId]);

  useFocusEffect(load);

  const myRank = rows.findIndex((r) => r.id === myId) + 1;
  const elo = profile?.elo ?? 0;
  const delta7 = last7Delta(matches);

  const filtered = rows.filter((e) => {
    if (filter === 1) return e.country === 'France';
    if (filter === 2) return (e.city ?? '').toLowerCase().startsWith('paris');
    if (filter === 3) return e.id === myId || friendIds.includes(e.id);
    return true;
  });

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">ELO-Ranking</ThemedText>

          {/* Carte Mon classement */}
          <View style={styles.meCard}>
            <View style={styles.meTop}>
              <ThemedText type="metric" themeColor="onBrand" style={styles.meElo}>
                {elo}
              </ThemedText>
              <View style={styles.meRight}>
                <ThemedText type="smallBold" style={{ color: Palette.lime }}>
                  Mon classement
                </ThemedText>
                {myRank > 0 ? (
                  <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.85 }}>
                    #{myRank} mondial
                  </ThemedText>
                ) : null}
              </View>
            </View>
            <View style={styles.meDelta}>
              <Ionicons
                name={delta7 >= 0 ? 'caret-up' : 'caret-down'}
                size={16}
                color={delta7 >= 0 ? Palette.lime : Palette.red}
              />
              <ThemedText type="smallBold" style={{ color: delta7 >= 0 ? Palette.lime : Palette.red }}>
                {delta7 >= 0 ? '+' : ''}
                {delta7} · 7 derniers jours
              </ThemedText>
            </View>
          </View>

          {/* ───────── Classement ───────── */}
          <View style={styles.body}>
              <View style={styles.filters}>
                {FILTERS.map((f, i) => (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(i)}
                    style={[styles.pill, filter === i ? styles.pillActive : styles.pillIdle]}>
                    <ThemedText type="smallBold" themeColor={filter === i ? 'onBrand' : 'text'}>
                      {f}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.list}>
                {filtered.map((e, i) => {
                  const mine = e.id === myId;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => router.push({ pathname: '/player', params: { id: e.id } })}
                      style={[styles.row, mine && styles.rowMine]}>
                      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rank}>
                        {i + 1}
                      </ThemedText>
                      <Avatar name={e.display_name} size={36} />
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
                })}
                {filtered.length === 0 ? (
                  <ThemedText type="default" themeColor="textSecondary">
                    {filter === 3 ? 'Aucun ami pour l’instant.' : 'Aucun joueur pour ce filtre.'}
                  </ThemedText>
                ) : null}
              </View>
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

  meCard: { backgroundColor: Palette.evergreen, borderRadius: Radius.md, padding: Spacing.four, marginTop: Spacing.three, gap: Spacing.two },
  meTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meElo: { fontSize: 44, lineHeight: 48 },
  meRight: { alignItems: 'flex-end', gap: Spacing.half },
  meDelta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },

  body: { marginTop: Spacing.four, gap: Spacing.two },

  filters: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.evergreen },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },

  list: { gap: Spacing.two },
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
    overflow: 'hidden',
  },
  rowMine: { backgroundColor: Palette.lime, borderColor: Palette.lime },
  rank: { width: 22 },
  rowMain: { flex: 1 },
});
