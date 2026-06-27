import { Ionicons } from '@expo/vector-icons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchOtherPlayers, type LeaderboardEntry } from '@/lib/players/profile';
import {
  fetchIncomingChallenges,
  fetchRecentOpponents,
  respondChallenge,
  type Challenge,
  type RecentOpponent,
} from '@/lib/social/challenges';

const CITIES = ['Autour de moi', 'Paris', 'Lyon', 'Bordeaux'];

function cityMatches(city: string | null, filter: number): boolean {
  if (filter === 0) return true;
  const c = (city ?? '').toLowerCase();
  if (filter === 1) return c.includes('paris');
  if (filter === 2) return c.includes('lyon');
  return c.includes('bordeaux');
}

export default function DefisScreen() {
  const { session } = useAuth();
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [recent, setRecent] = useState<RecentOpponent[]>([]);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState(0);
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchOtherPlayers(id, 100).then(setPlayers);
      fetchIncomingChallenges(id).then(setChallenges);
      fetchRecentOpponents(id, 6).then(setRecent);
    }, [session?.user?.id]),
  );

  function goChallenge(p: { id: string; name: string; elo: number; city: string | null }) {
    router.push({
      pathname: '/challenge',
      params: { opponentId: p.id, opponentName: p.name, opponentElo: String(p.elo), opponentCity: p.city ?? '' },
    });
  }
  const goProfile = (id: string) => router.push({ pathname: '/player', params: { id } });

  async function accept(c: Challenge) {
    await respondChallenge(c.id, 'accepted').catch(() => {});
    setChallenges((prev) => prev.filter((x) => x.id !== c.id));
    router.push({ pathname: '/new-match', params: { opponentId: c.from_player, opponentName: c.from?.display_name ?? 'Joueur' } });
  }
  async function decline(c: Challenge) {
    await respondChallenge(c.id, 'declined').catch(() => {});
    setChallenges((prev) => prev.filter((x) => x.id !== c.id));
  }

  const q = query.trim().toLowerCase();
  const filtered = players.filter((p) => p.display_name.toLowerCase().includes(q) && cityMatches(p.city, city));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Défis</ThemedText>

          <Pressable style={styles.tournoiBtn} onPress={() => router.push('/tournoi-new' as Href)}>
            <Ionicons name="trophy" size={18} color={Palette.evergreen} />
            <ThemedText type="smallBold" themeColor="brand">
              Créer un tournoi
            </ThemedText>
          </Pressable>

          <TextInput
            style={styles.search}
            placeholder="Chercher un joueur..."
            placeholderTextColor={Palette.grey}
            value={query}
            onChangeText={setQuery}
          />

          <View style={styles.cities}>
            {CITIES.map((cLabel, i) => (
              <Pressable
                key={cLabel}
                onPress={() => setCity(i)}
                style={[styles.cityPill, city === i ? styles.cityActive : styles.cityIdle]}>
                <ThemedText type="smallBold" themeColor={city === i ? 'onBrand' : 'text'}>
                  {cLabel}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {challenges.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Défis reçus
              </ThemedText>
              <View style={styles.list}>
                {challenges.map((c) => (
                  <View key={c.id} style={styles.challengeCard}>
                    <Avatar name={c.from?.display_name ?? '?'} size={44} />
                    <View style={styles.cardMain}>
                      <ThemedText type="cardTitle">{c.from?.display_name ?? 'Joueur'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Défi · Format {(c.format ?? 'wtt').toUpperCase()}
                      </ThemedText>
                    </View>
                    <Pressable style={styles.declineBtn} onPress={() => decline(c)}>
                      <Ionicons name="close" size={18} color={Palette.redInk} />
                    </Pressable>
                    <Pressable style={styles.acceptBtn} onPress={() => accept(c)}>
                      <ThemedText type="smallBold" themeColor="onBrand">
                        Accepter
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {recent.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Adversaires récents
              </ThemedText>
              <View style={styles.list}>
                {recent.map((o) => (
                  <View key={o.id} style={styles.card}>
                    <Pressable style={styles.cardLeft} onPress={() => goProfile(o.id)}>
                      <Avatar name={o.name} size={48} color={Palette.purple} />
                      <View style={styles.cardMain}>
                        <ThemedText type="cardTitle">{o.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          ELO {o.elo}
                          {o.city ? ` · ${o.city}` : ''}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <Pressable style={styles.revanche} onPress={() => goChallenge(o)}>
                      <ThemedText type="smallBold" themeColor="brand">
                        Revanche
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Joueurs près de toi
          </ThemedText>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun joueur pour cette recherche. 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map((p) => (
                <View key={p.id} style={styles.card}>
                  <Pressable style={styles.cardLeft} onPress={() => goProfile(p.id)}>
                    <Avatar name={p.display_name} size={48} />
                    <View style={styles.cardMain}>
                      <ThemedText type="cardTitle">{p.display_name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        ELO {p.elo}
                        {p.city ? ` · ${p.city}` : ''}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.defier}
                    onPress={() => goChallenge({ id: p.id, name: p.display_name, elo: p.elo, city: p.city })}>
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
  tournoiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    marginTop: Spacing.three,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
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
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.evergreen,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  declineBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  acceptBtn: { backgroundColor: Palette.evergreen, borderRadius: Radius.xs, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  cardMain: { flex: 1 },
  defier: {
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  revanche: {
    backgroundColor: Palette.lime,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
