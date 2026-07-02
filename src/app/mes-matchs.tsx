import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchRecentMatches, type MatchView } from '@/lib/matches/history';

const TABS = ['Tous', 'Victoires', 'Défaites'];

function matchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function MesMatchsScreen() {
  const { session } = useAuth();
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [tab, setTab] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (id) fetchRecentMatches(id, 200).then(setMatches);
    }, [session?.user?.id]),
  );

  const confirmed = matches.filter((m) => m.status === 'confirmed');
  const filtered = confirmed.filter((m) => (tab === 1 ? m.won : tab === 2 ? !m.won : true));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Tous mes matchs</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.tabs}>
          {TABS.map((t, i) => (
            <Pressable key={t} onPress={() => setTab(i)} style={[styles.tab, tab === i ? styles.tabOn : styles.tabOff]}>
              <ThemedText type="smallBold" themeColor={tab === i ? 'onBrand' : 'text'}>
                {t}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun match dans cette catégorie.
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {filtered.map((m) => (
                <View key={m.id} style={styles.row}>
                  <View style={[styles.bar, { backgroundColor: m.won ? Palette.green : Palette.red }]} />
                  <View style={styles.main}>
                    <View style={styles.titleLine}>
                      <ThemedText type="cardTitle">vs {m.opponent}</ThemedText>
                      <View style={styles.fmt}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {m.format}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {matchDate(m.date)}
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
        </ScrollView>
      </SafeAreaView>
    </View>
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
  tabs: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  tab: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  tabOn: { backgroundColor: Palette.evergreen },
  tabOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    paddingRight: Spacing.three,
  },
  bar: { width: 5, alignSelf: 'stretch' },
  main: { flex: 1, padding: Spacing.three },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fmt: { backgroundColor: Palette.whitePP, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
});
