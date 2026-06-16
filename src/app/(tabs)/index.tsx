import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchFeed, type FeedEvent } from '@/lib/feed/feed';
import { confirmMatch, disputeMatch, fetchPendingToConfirm, type PendingMatch } from '@/lib/matches/confirm';
import { computeEloProgression, computeStats, fetchRecentMatches, type MatchView } from '@/lib/matches/history';
import { fetchLeaderboard, fetchMyProfile, type PlayerProfile } from '@/lib/players/profile';
import { unreadCount } from '@/lib/social/notifications';

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
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(() => {
    const id = session?.user?.id;
    if (!id) return;
    fetchMyProfile(id).then(setProfile);
    fetchRecentMatches(id, 50).then(setMatches);
    fetchPendingToConfirm(id).then(setPending);
    fetchFeed(20).then(setFeed);
    unreadCount().then(setUnread);
    fetchLeaderboard(200).then((rows) => {
      const i = rows.findIndex((r) => r.id === id);
      setRank(i >= 0 ? i + 1 : null);
    });
  }, [session?.user?.id]);

  useFocusEffect(load);

  async function onConfirm(m: PendingMatch) {
    try {
      setActingId(m.id);
      const r = await confirmMatch(m.id);
      load();
      router.push({
        pathname: '/post-match',
        params: {
          matchId: m.id,
          won: String(r.won),
          delta: String(r.delta_me),
          opponentName: m.proposerName,
          score: m.myScore,
        },
      });
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setActingId(null);
    }
  }

  function onDispute(m: PendingMatch) {
    Alert.alert('Contester le score ?', `Le match contre ${m.proposerName} sera marqué comme contesté (aucun ELO).`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Contester',
        style: 'destructive',
        onPress: async () => {
          try {
            setActingId(m.id);
            await disputeMatch(m.id);
            load();
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  }

  const name = profile?.display_name ?? 'Joueur';
  const elo = profile?.elo ?? 1200;
  const stats = computeStats(matches);
  const progression = computeEloProgression(matches);
  const maxAbs = Math.max(1, ...progression.months.map((mm) => Math.abs(mm.delta)));
  // Les matchs en attente de MA confirmation sont déjà dans la section « À confirmer ».
  const recent = matches.filter((m) => !(m.status === 'pending' && !m.iProposed));

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.three }]}>
          <Avatar name={name} size={72} color={Palette.purple} uri={profile?.avatar_url} />
          <View style={styles.headerText}>
            <ThemedText type="subtitle" themeColor="onBrand">
              {name}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: Palette.lime }}>
              {elo} pts
              {rank ? ` · #${rank}` : ''}
              {(profile?.glicko_rd ?? 0) > 200 ? ' · provisoire' : ''}
            </ThemedText>
          </View>
          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push('/messages')} hitSlop={10}>
              <Ionicons name="chatbubble-outline" size={22} color={Palette.whitePP} />
            </Pressable>
            <Pressable onPress={() => router.push('/notifications')} hitSlop={10}>
              <Ionicons name="notifications-outline" size={22} color={Palette.whitePP} />
              {unread > 0 ? <View style={styles.badge} /> : null}
            </Pressable>
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
            Progression ELO
          </ThemedText>
          <View style={styles.card}>
            <ThemedText type="subtitle" themeColor={progression.thisMonth >= 0 ? 'brand' : 'textMuted'}>
              {progression.thisMonth >= 0 ? '+' : ''}
              {progression.thisMonth} ce mois
            </ThemedText>
            <View style={styles.eloChart}>
              {progression.months.map((mm, i) => (
                <View key={i} style={styles.eloCol}>
                  <View style={styles.eloHalfTop}>
                    {mm.delta >= 0 ? (
                      <View style={{ width: '60%', height: Math.max(2, (mm.delta / maxAbs) * 36), backgroundColor: Palette.green, borderRadius: 2 }} />
                    ) : null}
                  </View>
                  <View style={styles.eloBase} />
                  <View style={styles.eloHalfBot}>
                    {mm.delta < 0 ? (
                      <View style={{ width: '60%', height: Math.max(2, (Math.abs(mm.delta) / maxAbs) * 36), backgroundColor: Palette.red, borderRadius: 2 }} />
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textMuted" style={styles.eloLbl}>
                    {mm.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>

          {pending.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                À confirmer
              </ThemedText>
              <View style={{ gap: Spacing.two }}>
                {pending.map((m) => (
                  <View key={m.id} style={styles.confirmCard}>
                    <View style={styles.confirmTop}>
                      <Avatar name={m.proposerName} size={40} color={Palette.blue} />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="cardTitle">{m.proposerName} a saisi un match</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {m.isRanked ? 'Classé' : 'Amical'} · Bo{m.bestOf} · ton score {m.myScore}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.confirmActions}>
                      <Pressable
                        style={[styles.cBtn, styles.cDispute]}
                        disabled={actingId === m.id}
                        onPress={() => onDispute(m)}>
                        <ThemedText type="smallBold" themeColor="text">
                          Contester
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.cBtn, styles.cConfirm]}
                        disabled={actingId === m.id}
                        onPress={() => onConfirm(m)}>
                        {actingId === m.id ? (
                          <ActivityIndicator color={Palette.whitePP} size="small" />
                        ) : (
                          <ThemedText type="smallBold" themeColor="onBrand">
                            Confirmer {m.myScore}
                          </ThemedText>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.matchesHead}>
            <ThemedText type="sectionTitle" themeColor="textSecondary">
              Derniers matchs
            </ThemedText>
            {recent.length > 0 ? (
              <Pressable onPress={() => router.push('/mes-matchs')}>
                <ThemedText type="smallBold" themeColor="brand">
                  Tous mes matchs
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          {recent.length === 0 ? (
            <View style={styles.card}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun match pour l&apos;instant. Va dans Défis pour lancer ton premier match ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {recent.slice(0, 8).map((m) => {
                const barColor =
                  m.status === 'pending' ? Palette.grey : m.status === 'disputed' ? Palette.red : m.won ? Palette.green : Palette.red;
                return (
                  <View key={m.id} style={styles.matchCard}>
                    <View style={[styles.matchBar, { backgroundColor: barColor }]} />
                    <View style={styles.matchMain}>
                      <View style={styles.matchTitle}>
                        <ThemedText type="cardTitle">vs {m.opponent}</ThemedText>
                        <View style={styles.fmt}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {m.format}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {m.status === 'pending'
                          ? `${m.ranked ? 'Classé' : 'Amical'} · En attente de confirmation ⏳`
                          : m.status === 'disputed'
                            ? `${m.ranked ? 'Classé' : 'Amical'} · Contesté ⚠️`
                            : `${m.ranked ? 'Classé' : 'Amical'} · ${relativeDate(m.date)}${m.delta ? ` · ${m.delta > 0 ? '+' : ''}${m.delta} ELO` : ''}`}
                      </ThemedText>
                    </View>
                    <ThemedText type="subtitle" themeColor={m.status === 'confirmed' && m.won ? 'brand' : 'textMuted'}>
                      {m.score}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          )}

          {feed.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Activité du club
              </ThemedText>
              <View style={{ gap: Spacing.two }}>
                {feed.map((f) => (
                  <View key={f.id} style={styles.feedRow}>
                    {f.type === 'newcomer' ? (
                      <View style={[styles.feedIcon, { backgroundColor: Palette.lime }]}>
                        <Ionicons name="person-add" size={16} color={Palette.evergreen} />
                      </View>
                    ) : (
                      <Avatar name={f.actorName ?? '?'} size={36} color={Palette.purple} />
                    )}
                    <View style={styles.feedMain}>
                      <ThemedText type="cardTitle" numberOfLines={1}>
                        {f.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {f.body ? `${f.body} · ` : ''}
                        {relativeDate(f.createdAt)}
                      </ThemedText>
                    </View>
                    {f.eloDelta ? (
                      <View style={[styles.deltaChip, { backgroundColor: f.eloDelta > 0 ? Palette.lime : Palette.whitePP }]}>
                        <ThemedText type="smallBold" themeColor={f.eloDelta > 0 ? 'brand' : 'textMuted'}>
                          {f.eloDelta > 0 ? '+' : ''}
                          {f.eloDelta}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

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
  headerIcons: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.redInk },
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
  matchTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  matchesHead: {
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fmt: {
    backgroundColor: Palette.whitePP,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  eloChart: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.three, gap: Spacing.one },
  eloCol: { flex: 1, alignItems: 'center' },
  eloHalfTop: { height: 36, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  eloHalfBot: { height: 36, width: '100%', justifyContent: 'flex-start', alignItems: 'center' },
  eloBase: { height: StyleSheet.hairlineWidth, width: '100%', backgroundColor: Palette.border },
  eloLbl: { marginTop: Spacing.one, fontSize: 9 },
  confirmCard: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.blue,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  confirmTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  confirmActions: { flexDirection: 'row', gap: Spacing.two },
  cBtn: { flex: 1, height: 44, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  cDispute: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  cConfirm: { backgroundColor: Palette.evergreen },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  feedIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  feedMain: { flex: 1 },
  deltaChip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
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
