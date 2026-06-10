import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchOtherPlayers, type LeaderboardEntry } from '@/lib/players/profile';

const CITIES = ['Autour de moi', 'Paris', 'Lyon', 'Bordeaux'];

export default function DefisScreen() {
  const { session } = useAuth();
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const id = session?.user?.id;
    if (!id) return;
    fetchOtherPlayers(id, 100).then(setPlayers);
  }, [session?.user?.id]);

  const filtered = players.filter((p) =>
    p.display_name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Défis</ThemedText>

          <TextInput
            style={styles.search}
            placeholder="Chercher un joueur..."
            placeholderTextColor={Palette.grey}
            value={query}
            onChangeText={setQuery}
          />

          <View style={styles.cities}>
            {CITIES.map((c, i) => (
              <View key={c} style={[styles.cityPill, i === 0 ? styles.cityActive : styles.cityIdle]}>
                <ThemedText type="smallBold" themeColor={i === 0 ? 'onBrand' : 'text'}>
                  {c}
                </ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Joueurs près de toi
          </ThemedText>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun autre joueur pour l&apos;instant. Invite des potes du club à rejoindre Ping Pang ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map((p) => (
                <View key={p.id} style={styles.card}>
                  <Avatar name={p.display_name} size={48} />
                  <View style={styles.cardMain}>
                    <ThemedText type="cardTitle">{p.display_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      ELO {p.elo}
                      {p.city ? ` · ${p.city}` : ''}
                    </ThemedText>
                  </View>
                  <Pressable style={styles.defier}>
                    <ThemedText type="smallBold" themeColor="onBrand">
                      Défier
                    </ThemedText>
                  </Pressable>
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
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  search: {
    height: 52,
    marginTop: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  cities: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  cityPill: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  cityActive: { backgroundColor: Palette.evergreen },
  cityIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  list: { gap: Spacing.two },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  cardMain: { flex: 1 },
  defier: {
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
