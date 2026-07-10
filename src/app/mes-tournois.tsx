/**
 * « Mes tournois » — écran d'archive dédié. Onglets En cours / Terminés + filtre par ville
 * (quand le joueur en accumule). Évite l'empilement de 10 tournois sur l'écran Défis.
 *
 * Données via useMyTournaments (react-query, refetch au focus). Statut 'done' = terminé.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useMyTournaments, type Tournament } from '@/lib/tournaments/tournaments';

const STATUS: Record<string, string> = {
  open: 'Inscriptions ouvertes',
  poules: 'Phase de poules',
  bracket: 'Phase finale',
  done: 'Terminé',
};
const ACTIVE = new Set(['open', 'poules', 'bracket']);

export default function MyTournamentsScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const tournamentsQ = useMyTournaments(myId);
  useRefreshOnFocus(tournamentsQ.refetch);

  const all = useMemo(() => tournamentsQ.data ?? [], [tournamentsQ.data]);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [city, setCity] = useState<string | null>(null);

  // Villes distinctes renseignées sur mes tournois (pour les chips de filtre).
  const cities = useMemo(
    () => Array.from(new Set(all.map((t) => t.city?.trim()).filter((c): c is string => !!c))).sort(),
    [all],
  );

  const activeCount = useMemo(() => all.filter((t) => ACTIVE.has(t.status)).length, [all]);
  const doneCount = all.length - activeCount;

  const list = useMemo(
    () =>
      all.filter((t) => {
        const inTab = tab === 'active' ? ACTIVE.has(t.status) : t.status === 'done';
        const inCity = !city || (t.city ?? '').trim() === city;
        return inTab && inCity;
      }),
    [all, tab, city],
  );

  const renderItem = ({ item: t }: { item: Tournament }) => {
    const done = t.status === 'done';
    return (
      <Pressable style={styles.card} onPress={() => router.push({ pathname: '/tournoi', params: { id: t.id } })}>
        <View style={[styles.tIcon, { backgroundColor: done ? Palette.border : Palette.lime }]}>
          <Ionicons name="trophy" size={18} color={done ? Palette.grey : Palette.evergreen} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="cardTitle" numberOfLines={1}>
            {t.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {[t.city, `Code ${t.code}`, STATUS[t.status] ?? t.status].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Palette.grey} />
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Mes tournois</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        {/* Onglets En cours / Terminés */}
        <View style={styles.tabs}>
          {([
            ['active', `En cours${activeCount ? ` (${activeCount})` : ''}`],
            ['done', `Terminés${doneCount ? ` (${doneCount})` : ''}`],
          ] as const).map(([key, lbl]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key ? styles.tabOn : styles.tabOff]}>
              <ThemedText type="smallBold" themeColor={tab === key ? 'onBrand' : 'textSecondary'}>
                {lbl}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Filtre ville (si des villes sont renseignées) */}
        {cities.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={styles.filtersRow}>
            {[null, ...cities].map((c) => {
              const active = city === c;
              return (
                <Pressable key={c ?? 'all'} style={[styles.pill, active && styles.pillOn]} onPress={() => setCity(c)}>
                  <ThemedText type="smallBold" style={{ color: active ? Palette.whitePP : Palette.grey }}>
                    {c ?? 'Toutes'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.scroll}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
              {tab === 'active' ? 'Aucun tournoi en cours.' : 'Aucun tournoi terminé.'}
            </ThemedText>
          }
        />
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  tabs: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  tab: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
  tabOn: { backgroundColor: Palette.ink2 },
  tabOff: { backgroundColor: Palette.white },
  filtersRow: { maxHeight: 44, paddingHorizontal: Spacing.lg },
  filters: { gap: Spacing.sm, paddingRight: Spacing.xl, alignItems: 'center' },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: Palette.ink2 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl },
  sep: { height: Spacing.sm },
  empty: { marginTop: Spacing.lg, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  tIcon: { width: 36, height: 36, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
});
