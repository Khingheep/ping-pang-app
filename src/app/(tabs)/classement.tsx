/**
 * Onglet ELO-RANKING — hub compétition à 3 sous-vues :
 *   • Classement : carte « Mon classement » (ELO + delta 7 jours) + leaderboard Monde/France/Paris/Amis.
 *   • Défis      : défis en cours (statuts) + défis passés (V/D).
 *   • Événements : rejoindre un tournoi par code, créer un tournoi, mes tournois.
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
import {
  fetchIncomingChallenges,
  fetchOutgoingChallenges,
  FORMAT_INFO,
  respondChallenge,
  type Challenge,
  type ChallengeFormat,
} from '@/lib/social/challenges';
import { fetchFriendIds } from '@/lib/social/friends';

const SUBTABS = ['Classement', 'Défis'] as const;
const FILTERS = ['Monde', 'France', 'Paris', 'Amis'] as const;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  sent: { label: 'En attente', color: Palette.blue },
  accepted: { label: 'Rentrer les scores', color: Palette.lime },
  declined: { label: 'Refusé', color: Palette.red },
  played: { label: 'Joué', color: Palette.border },
};

function fmtTitle(f: string | null): string {
  return FORMAT_INFO[(f ?? 'wtt') as ChallengeFormat]?.title ?? (f ?? 'WTT').toUpperCase();
}

export default function RankingScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [sub, setSub] = useState(0);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [filter, setFilter] = useState(0);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [outgoing, setOutgoing] = useState<Challenge[]>([]);

  const load = useCallback(() => {
    if (!myId) return;
    fetchMyProfile(myId).then(setProfile);
    fetchLeaderboard(200).then(setRows);
    fetchFriendIds(myId).then(setFriendIds);
    fetchRecentMatches(myId, 100).then(setMatches);
    fetchIncomingChallenges(myId).then(setIncoming);
    fetchOutgoingChallenges(myId).then(setOutgoing);
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

  const passed = matches.filter((m) => m.status === 'confirmed');

  async function decline(c: Challenge) {
    await respondChallenge(c.id, 'declined').catch(() => {});
    setIncoming((prev) => prev.filter((x) => x.id !== c.id));
  }
  function accept(c: Challenge) {
    respondChallenge(c.id, 'accepted').catch(() => {});
    setIncoming((prev) => prev.filter((x) => x.id !== c.id));
    router.push({ pathname: '/new-match', params: { opponentId: c.from_player, opponentName: c.from?.display_name ?? 'Joueur' } });
  }

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

          {/* Sous-onglets */}
          <View style={styles.subtabs}>
            {SUBTABS.map((t, i) => (
              <Pressable key={t} onPress={() => setSub(i)} style={[styles.subtab, sub === i ? styles.subOn : styles.subOff]}>
                <ThemedText type="smallBold" themeColor={sub === i ? 'onBrand' : 'text'} numberOfLines={1}>
                  {t}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* ───────── Classement ───────── */}
          {sub === 0 ? (
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
          ) : null}

          {/* ───────── Défis ───────── */}
          {sub === 1 ? (
            <View style={styles.body}>
              <Pressable style={styles.cta} onPress={() => router.push('/jouer')}>
                <Ionicons name="add" size={20} color={Palette.whitePP} />
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Nouveau défi
                </ThemedText>
              </Pressable>

              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Défis en cours
              </ThemedText>
              {incoming.length === 0 && outgoing.filter((c) => c.status !== 'played').length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    Aucun défi en cours.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {incoming.map((c) => (
                    <View key={c.id} style={styles.challengeCard}>
                      <Avatar name={c.from?.display_name ?? '?'} size={40} />
                      <View style={styles.cardMain}>
                        <ThemedText type="cardTitle" numberOfLines={1}>
                          {c.from?.display_name ?? 'Joueur'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Te défie · {fmtTitle(c.format)}
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
                  {outgoing
                    .filter((c) => c.status !== 'played')
                    .map((c) => {
                      const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.sent;
                      const canScore = c.status === 'accepted';
                      return (
                        <Pressable
                          key={c.id}
                          disabled={!canScore}
                          onPress={() =>
                            canScore &&
                            router.push({ pathname: '/new-match', params: { opponentId: c.to_player, opponentName: c.to?.display_name ?? 'Joueur' } })
                          }
                          style={styles.row}>
                          <Avatar name={c.to?.display_name ?? '?'} size={36} color={Palette.purple} />
                          <View style={styles.rowMain}>
                            <ThemedText type="cardTitle" numberOfLines={1}>
                              {c.to?.display_name ?? 'Joueur'}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {fmtTitle(c.format)}
                            </ThemedText>
                          </View>
                          <View style={[styles.statusPill, { backgroundColor: st.color }]}>
                            <ThemedText type="smallBold" themeColor="text">
                              {st.label}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                </View>
              )}

              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Défis passés
              </ThemedText>
              {passed.length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    Aucun match joué pour l’instant.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {passed.slice(0, 20).map((m) => (
                    <View key={m.id} style={styles.row}>
                      <View style={[styles.resultBar, { backgroundColor: m.won ? Palette.green : Palette.red }]} />
                      <View style={styles.rowMain}>
                        <ThemedText type="cardTitle" numberOfLines={1}>
                          vs {m.opponent}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {m.format}
                          {m.delta ? ` · ${m.delta > 0 ? '+' : ''}${m.delta} ELO` : ''}
                        </ThemedText>
                      </View>
                      <ThemedText type="subtitle" themeColor={m.won ? 'brand' : 'textMuted'}>
                        {m.score || '—'}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

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

  subtabs: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  subtab: { flex: 1, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderRadius: Radius.xs, alignItems: 'center' },
  subOn: { backgroundColor: Palette.evergreen },
  subOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
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
  resultBar: { width: 5, height: 36, borderRadius: 3 },

  section: { marginTop: Spacing.three, marginBottom: Spacing.one },
  empty: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, borderRadius: Radius.sm, padding: Spacing.four },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
  },
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
  cardMain: { flex: 1 },
  declineBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  acceptBtn: { backgroundColor: Palette.evergreen, borderRadius: Radius.xs, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  statusPill: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
});
