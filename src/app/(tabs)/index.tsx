import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { computeStats, fetchRecentMatches, type MatchView } from '@/lib/matches/history';
import { fetchLeaderboard, fetchMyProfile, type PlayerProfile } from '@/lib/players/profile';

function relativeDate(iso: string): string {
  const d = new Date(iso).getTime();
  const now = new Date().getTime();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function AccueilScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchView[]>([]);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchMyProfile(id).then(setProfile);
      fetchRecentMatches(id, 50).then(setMatches);
      fetchLeaderboard(200).then((rows) => {
        const i = rows.findIndex((r) => r.id === id);
        setRank(i >= 0 ? i + 1 : null);
      });
    }, [session?.user?.id]),
  );

  const name = profile?.display_name ?? 'Joueur';
  const elo = profile?.elo ?? 1200;
  const stats = computeStats(matches);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
          <Avatar name={name} size={72} color={Palette.purple} />
          <View style={styles.headerText}>
            <ThemedText type="subtitle" themeColor="onBrand">
              {name}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: Palette.lime }}>
              ELO {elo}
              {rank ? ` · #${rank} France` : ''}
            </ThemedText>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.statRow}>
            {[
              { v: String(stats.total), l: 'Matchs' },
              { v: String(stats.wins), l: 'Victoires' },
              { v: stats.winPct === null ? '—' : `${stats.winPct}%`, l: 'Win %' },
            ].map((s) => (
              <View key={s.l} style={styles.statCard}>
                <ThemedText type="metric" style={styles.statValue}>
                  {s.v}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {s.l}
                </ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Derniers matchs
          </ThemedText>
          {matches.length === 0 ? (
            <View style={styles.card}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun match pour l&apos;instant. Va dans Défis pour lancer ton premier match ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {matches.slice(0, 8).map((m) => (
                <View key={m.id} style={styles.matchCard}>
                  <View style={[styles.matchBar, { backgroundColor: m.won ? Palette.green : Palette.red }]} />
                  <View style={styles.matchMain}>
                    <ThemedText type="cardTitle">vs {m.opponent}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {m.ranked ? 'Classé' : 'Amical'} · {relativeDate(m.date)}
                      {m.delta ? ` · ${m.delta > 0 ? '+' : ''}${m.delta} ELO` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="subtitle" themeColor={m.won ? 'brand' : 'textMuted'}>
                    {m.score}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.settingsRow} onPress={() => router.push('/settings')}>
            <ThemedText type="cardTitle">Paramètres du compte</ThemedText>
            <Ionicons name="chevron-forward" size={18} color={Palette.grey} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  scroll: { paddingBottom: BottomTabInset + Spacing.five },
  header: {
    backgroundColor: Palette.evergreen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  headerText: { flex: 1, gap: Spacing.half },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  statCard: {
    flex: 1,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  statValue: { fontSize: 30, lineHeight: 34 },
  section: { marginTop: Spacing.four, marginBottom: Spacing.two },
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingRight: Spacing.three,
    overflow: 'hidden',
  },
  matchBar: { width: 5, alignSelf: 'stretch', borderTopLeftRadius: Radius.sm, borderBottomLeftRadius: Radius.sm },
  matchMain: { flex: 1, paddingLeft: Spacing.one },
  settingsRow: {
    marginTop: Spacing.four,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
