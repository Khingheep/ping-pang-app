import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { distanceKm, formatDistance, type LatLng } from '@/lib/location/distance';
import { useUserLocation } from '@/lib/location/use-location';
import { updateMyLocation, useMyProfile, useOtherPlayers, type LeaderboardEntry } from '@/lib/players/profile';
import { qk } from '@/lib/query/keys';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import {
  cancelChallenge,
  respondChallenge,
  subscribeChallenges,
  useActiveChallenges,
  useIncomingChallenges,
  useOutgoingChallenges,
  type Challenge,
} from '@/lib/social/challenges';
import { joinTournamentByCode, useMyTournaments } from '@/lib/tournaments/tournaments';
import { notify } from '@/lib/ui/alert';

const T_STATUS: Record<string, string> = {
  open: 'Inscriptions ouvertes',
  poules: 'Phase de poules',
  bracket: 'Phase finale',
  done: 'Terminé',
};

// Au-delà, on ne parle plus de « près de toi » : on affiche la ville plutôt qu'une distance absurde.
const NEARBY_MAX_KM = 150;

// Nombre de joueurs « près de toi » affichés par défaut (la recherche, elle, n'est pas limitée).
const NEARBY_MAX_COUNT = 10;

// Au-delà, un défi refusé n'est plus affiché dans « Mes défis en cours » (évite l'accumulation).
const DECLINED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Libellé + couleurs de la pastille de statut d'un défi que J'AI envoyé.
const OUT_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  sent: { label: 'En attente', bg: Palette.whitePP, fg: Palette.grey },
  accepted: { label: 'Accepté', bg: Palette.lime, fg: Palette.evergreen },
  declined: { label: 'Refusé', bg: Palette.whitePP, fg: Palette.redInk },
};

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

function Separator() {
  return <View style={styles.separator} />;
}

export default function DefisScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const { coords } = useUserLocation();
  const qc = useQueryClient();

  const playersQ = useOtherPlayers(myId, 100);
  const meQ = useMyProfile(myId);
  const challengesQ = useIncomingChallenges(myId);
  const outgoingQ = useOutgoingChallenges(myId);
  const activeQ = useActiveChallenges(myId);
  const tournamentsQ = useMyTournaments(myId);

  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  // Rafraîchit chaque query au focus d'écran ; no-op réseau tant qu'elle est encore fraîche.
  useRefreshOnFocus(playersQ.refetch);
  useRefreshOnFocus(challengesQ.refetch);
  useRefreshOnFocus(outgoingQ.refetch);
  useRefreshOnFocus(activeQ.refetch);
  useRefreshOnFocus(tournamentsQ.refetch);

  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const challenges = challengesQ.data ?? [];
  const outgoing = useMemo(() => outgoingQ.data ?? [], [outgoingQ.data]);
  const active = activeQ.data ?? [];
  const tournaments = tournamentsQ.data ?? [];

  // Dès qu'on a la vraie position, on la mémorise pour soi (et pour apparaître
  // chez les autres dans « Joueurs près de toi »).
  useEffect(() => {
    if (myId && coords) void updateMyLocation(myId, coords);
  }, [myId, coords]);

  // Temps réel : tout défi reçu/envoyé/modifié rafraîchit les listes sans attendre un refocus.
  useEffect(() => {
    if (!myId) return;
    return subscribeChallenges(myId, () => {
      void qc.invalidateQueries({ queryKey: qk.challenges.incoming(myId) });
      void qc.invalidateQueries({ queryKey: qk.challenges.outgoing(myId) });
      void qc.invalidateQueries({ queryKey: qk.challenges.active(myId) });
    });
  }, [myId, qc]);

  // Accepter = « OK on joue » : le défi passe « accepté » et rejoint la section « À jouer » (visible
  // des 2 joueurs). On NE force PLUS la saisie du score ici (on accepte AVANT de jouer) → sinon en
  // fermant l'écran on perdait le défi.
  async function accept(c: Challenge) {
    if (!myId) return;
    const key = qk.challenges.incoming(myId);
    const prev = qc.getQueryData<Challenge[]>(key);
    qc.setQueryData<Challenge[]>(key, (old) => (old ?? []).filter((x) => x.id !== c.id)); // optimiste
    try {
      await respondChallenge(c.id, 'accepted');
      void qc.invalidateQueries({ queryKey: qk.challenges.active(myId) }); // → apparaît dans « À jouer »
    } catch {
      if (prev) qc.setQueryData(key, prev); // rollback si échec réseau
    }
  }
  async function decline(c: Challenge) {
    if (!myId) return;
    const key = qk.challenges.incoming(myId);
    const prev = qc.getQueryData<Challenge[]>(key);
    qc.setQueryData<Challenge[]>(key, (old) => (old ?? []).filter((x) => x.id !== c.id));
    try {
      await respondChallenge(c.id, 'declined');
    } catch {
      if (prev) qc.setQueryData(key, prev);
    }
  }
  async function cancelOutgoing(c: Challenge) {
    if (!myId) return;
    const key = qk.challenges.outgoing(myId);
    const prev = qc.getQueryData<Challenge[]>(key);
    qc.setQueryData<Challenge[]>(key, (old) => (old ?? []).filter((x) => x.id !== c.id));
    try {
      await cancelChallenge(c.id);
    } catch {
      if (prev) qc.setQueryData(key, prev);
    }
  }

  async function joinByCode() {
    if (!myId || !code.trim()) return;
    try {
      setJoining(true);
      const tid = await joinTournamentByCode(myId, code);
      setCode('');
      void qc.invalidateQueries({ queryKey: qk.tournaments.mine(myId) });
      router.push({ pathname: '/tournoi', params: { id: tid } });
    } catch (e) {
      notify('Code invalide', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setJoining(false);
    }
  }

  // « Mes défis en cours » = ceux que J'AI envoyés, en attente (« sent ») ou récemment refusés.
  // Les acceptés partent dans « À jouer » (visible des 2 joueurs) → on les retire d'ici.
  const visibleOutgoing = useMemo(() => {
    const now = Date.now();
    return outgoing.filter(
      (c) =>
        c.status !== 'accepted' &&
        (c.status !== 'declined' || now - new Date(c.created_at).getTime() < DECLINED_TTL_MS),
    );
  }, [outgoing]);

  const q = query.trim().toLowerCase();
  const myCity = (meQ.data?.city ?? '').trim().toLowerCase();
  // Rang « près de toi » : (1) distance GPS réelle si connue, sinon (2) même ville que moi
  // (position non partagée mais même ville → les comptes récents à Paris remontent quand même),
  // sinon (3) le reste. Sans recherche, on ne garde que les N premiers ; une recherche montre tout.
  const filtered = useMemo(() => {
    const list = players.filter((p) => p.display_name.toLowerCase().includes(q));
    const rank = (p: LeaderboardEntry) => {
      const km = kmTo(coords, p.lat, p.lng);
      if (Number.isFinite(km)) return km; // GPS connu → distance réelle (prioritaire)
      if (myCity && (p.city ?? '').trim().toLowerCase() === myCity) return 1e6; // même ville, sans GPS
      return 2e6; // ni GPS ni même ville
    };
    const sorted = [...list].sort((a, b) => rank(a) - rank(b));
    return q ? sorted : sorted.slice(0, NEARBY_MAX_COUNT);
  }, [players, q, coords, myCity]);

  const renderPlayer = useCallback(
    ({ item: p }: { item: LeaderboardEntry }) => {
      const km = kmTo(coords, p.lat, p.lng);
      const near = Number.isFinite(km) && km <= NEARBY_MAX_KM; // distance affichée seulement si vraiment proche
      return (
        <View style={styles.card}>
          <Pressable style={styles.cardLeft} onPress={() => router.push({ pathname: '/player', params: { id: p.id } })}>
            <Avatar name={p.display_name} size={48} uri={p.avatar_url} />
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
            onPress={() =>
              router.push({
                pathname: '/challenge',
                params: { opponentId: p.id, opponentName: p.display_name, opponentElo: String(p.elo), opponentCity: p.city ?? '' },
              })
            }>
            <ThemedText type="smallBold" themeColor="onBrand">
              Défier
            </ThemedText>
          </Pressable>
        </View>
      );
    },
    [coords],
  );

  // En-tête (tout ce qui précède la liste des joueurs). Passé comme ÉLÉMENT (pas fonction)
  // pour préserver le focus du champ de recherche entre deux frappes.
  const header = (
    <>
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
                <Avatar name={c.from?.display_name ?? '?'} size={44} uri={c.from?.avatar_url} />
                <View style={styles.cardMain}>
                  <ThemedText type="cardTitle">{c.from?.display_name ?? 'Joueur'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Défi · Format {(c.format ?? 'bo5').toUpperCase()}
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

      {active.length > 0 ? (
        <>
          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            À jouer
          </ThemedText>
          <View style={styles.list}>
            {active.map((c) => (
              <View key={c.id} style={styles.challengeCard}>
                <Avatar name={c.opponentName} size={44} uri={c.opponentAvatar} />
                <View style={styles.cardMain}>
                  <ThemedText type="cardTitle" numberOfLines={1}>
                    {c.opponentName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Défi accepté · Format {(c.format ?? 'bo5').toUpperCase()}
                  </ThemedText>
                </View>
                <Pressable
                  style={styles.scoreBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/new-match',
                      params: {
                        opponentId: c.opponentId,
                        opponentName: c.opponentName,
                        opponentAvatar: c.opponentAvatar ?? '',
                        challengeId: c.id,
                        format: c.format ?? 'bo5',
                      },
                    })
                  }>
                  <Ionicons name="create-outline" size={15} color={Palette.whitePP} />
                  <ThemedText type="smallBold" themeColor="onBrand">
                    Saisir le score
                  </ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {visibleOutgoing.length > 0 ? (
        <>
          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Mes défis en cours
          </ThemedText>
          <View style={styles.list}>
            {visibleOutgoing.map((c) => {
              const st = OUT_STATUS[c.status] ?? OUT_STATUS.sent;
              return (
                <View key={c.id} style={styles.card}>
                  <Avatar name={c.to?.display_name ?? '?'} size={44} uri={c.to?.avatar_url} />
                  <View style={styles.cardMain}>
                    <ThemedText type="cardTitle" numberOfLines={1}>
                      {c.to?.display_name ?? 'Joueur'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Défi · Format {(c.format ?? 'bo5').toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                    <ThemedText type="small" style={{ color: st.fg }}>
                      {st.label}
                    </ThemedText>
                  </View>
                  {c.status === 'sent' ? (
                    <Pressable style={styles.declineBtn} onPress={() => cancelOutgoing(c)} hitSlop={6}>
                      <Ionicons name="close" size={18} color={Palette.redInk} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
        Joueurs près de toi
      </ThemedText>
    </>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderPlayer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          ListHeaderComponent={header}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun joueur pour cette recherche. 🏓
              </ThemedText>
            </View>
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
  tournoiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
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
  separator: { height: Spacing.two },
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
  scoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  statusPill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  cardMain: { flex: 1 },
  defier: {
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  tIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
