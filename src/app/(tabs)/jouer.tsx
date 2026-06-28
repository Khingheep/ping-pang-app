import { Ionicons } from '@expo/vector-icons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { distanceKm, formatDistance, type LatLng } from '@/lib/location/distance';
import { useUserLocation } from '@/lib/location/use-location';
import { fetchOtherPlayers, type LeaderboardEntry, updateMyLocation } from '@/lib/players/profile';
import { fetchIncomingChallenges, respondChallenge, type Challenge } from '@/lib/social/challenges';
import { fetchMyTournaments, joinTournamentByCode, type Tournament } from '@/lib/tournaments/tournaments';
import { notify } from '@/lib/ui/alert';

const T_STATUS: Record<string, string> = {
  open: 'Inscriptions ouvertes',
  poules: 'Phase de poules',
  bracket: 'Phase finale',
  done: 'Terminé',
};

// Au-delà, on ne parle plus de « près de toi » : on affiche la ville plutôt qu'une distance absurde.
const NEARBY_MAX_KM = 150;

/**
 * Distance utilisateur → joueur en km, ou Infinity si la position manque/est invalide.
 * On traite (0,0) comme « pas de position » (valeur par défaut héritée, au large de l'Afrique)
 * pour éviter d'afficher « à 2000 km » à des joueurs qui n'ont jamais partagé leur position.
 */
function kmTo(from: LatLng | null, lat: number | null, lng: number | null): number {
  if (!from || lat == null || lng == null) return Infinity;
  if (lat === 0 && lng === 0) return Infinity;
  return distanceKm(from, { lat, lng });
}

export default function DefisScreen() {
  const { session } = useAuth();
  const { coords } = useUserLocation();
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [query, setQuery] = useState('');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchOtherPlayers(id, 100).then(setPlayers);
      fetchIncomingChallenges(id).then(setChallenges);
      fetchMyTournaments(id).then(setTournaments);
    }, [session?.user?.id]),
  );

  // Dès qu'on a la vraie position, on la mémorise pour soi (et pour apparaître
  // chez les autres dans « Joueurs près de toi »).
  useEffect(() => {
    const id = session?.user?.id;
    if (id && coords) void updateMyLocation(id, coords);
  }, [session?.user?.id, coords]);

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

  async function joinByCode() {
    const me = session?.user?.id;
    if (!me || !code.trim()) return;
    try {
      setJoining(true);
      const tid = await joinTournamentByCode(me, code);
      setCode('');
      router.push({ pathname: '/tournoi', params: { id: tid } });
    } catch (e) {
      notify('Code invalide', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setJoining(false);
    }
  }

  const q = query.trim().toLowerCase();
  // Filtré par recherche, puis trié par proximité quand on a la position (sinon par ELO).
  const filtered = useMemo(() => {
    const list = players.filter((p) => p.display_name.toLowerCase().includes(q));
    if (!coords) return list;
    return [...list].sort((a, b) => kmTo(coords, a.lat, a.lng) - kmTo(coords, b.lat, b.lng));
  }, [players, q, coords]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Défis</ThemedText>

          <View style={styles.tournRow}>
            <Pressable style={styles.tournoiBtn} onPress={() => router.push('/tournoi-new' as Href)}>
              <Ionicons name="trophy" size={18} color={Palette.evergreen} />
              <ThemedText type="smallBold" themeColor="brand">
                Créer un tournoi
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.joinRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="Rejoindre avec un code"
              placeholderTextColor={Palette.grey}
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
            />
            <Pressable
              style={[styles.joinBtn, (joining || !code.trim()) && { opacity: 0.5 }]}
              disabled={joining || !code.trim()}
              onPress={joinByCode}>
              <ThemedText type="smallBold" themeColor="onBrand">
                Rejoindre
              </ThemedText>
            </Pressable>
          </View>

          {tournaments.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Mes tournois
              </ThemedText>
              <View style={styles.list}>
                {tournaments.map((t) => (
                  <Pressable key={t.id} style={styles.card} onPress={() => router.push({ pathname: '/tournoi', params: { id: t.id } })}>
                    <View style={[styles.tIcon, { backgroundColor: t.status === 'done' ? Palette.lime : Palette.blue }]}>
                      <Ionicons name="trophy" size={18} color={Palette.evergreen} />
                    </View>
                    <View style={styles.cardMain}>
                      <ThemedText type="cardTitle" numberOfLines={1}>
                        {t.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Code {t.code} · {T_STATUS[t.status] ?? t.status}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Palette.grey} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <TextInput
            style={styles.search}
            placeholder="Chercher un joueur..."
            placeholderTextColor={Palette.grey}
            value={query}
            onChangeText={setQuery}
          />

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
              {filtered.map((p) => {
                const km = kmTo(coords, p.lat, p.lng);
                const near = Number.isFinite(km) && km <= NEARBY_MAX_KM; // distance affichée seulement si vraiment proche
                return (
                <View key={p.id} style={styles.card}>
                  <Pressable style={styles.cardLeft} onPress={() => goProfile(p.id)}>
                    <Avatar name={p.display_name} size={48} />
                    <View style={styles.cardMain}>
                      <ThemedText type="cardTitle">{p.display_name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        ELO {p.elo}
                        {near ? ` · à ${formatDistance(km)}` : p.city ? ` · ${p.city}` : ''}
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
                );
              })}
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
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  tournRow: { marginTop: Spacing.three },
  joinRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  codeInput: {
    flex: 1,
    height: 46,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-SemiBold',
    fontSize: 14,
    letterSpacing: 1,
  },
  joinBtn: { backgroundColor: Palette.evergreen, borderRadius: Radius.sm, paddingHorizontal: Spacing.four, alignItems: 'center', justifyContent: 'center' },
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
  tIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
