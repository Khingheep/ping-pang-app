import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { levelForElo } from '@/lib/elo';
import { useFfttCommonOpponents } from '@/lib/fftt/link';
import { usePlayerMatches } from '@/lib/matches/history';
import { useMyProfile } from '@/lib/players/profile';
import { qk } from '@/lib/query/keys';
import {
  acceptFriendRequest,
  removeFriend,
  sendFriendRequest,
  useFriendStatus,
  type FriendStatus,
} from '@/lib/social/friends';
import { reportPlayer } from '@/lib/players/moderation';
import { formatDuration, useLastTrainingSession, useTrainingStats } from '@/lib/training/sessions';
import { notify } from '@/lib/ui/alert';

/** Motifs de signalement (feuille). `destructive` = accent rouge. */
const REPORT_REASONS: { label: string; reason: string; destructive?: boolean }[] = [
  { label: 'Triche / faux score', reason: 'Triche / faux score' },
  { label: 'Usurpation d’identité', reason: 'Usurpation d’identité (faux compte)', destructive: true },
  { label: 'Autre comportement', reason: 'Comportement inapproprié' },
];

const FRIEND_CFG: Record<FriendStatus, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  none: { icon: 'person-add-outline', label: 'Ajouter en ami' },
  pending_out: { icon: 'time-outline', label: 'Demande envoyée' },
  pending_in: { icon: 'checkmark-circle', label: 'Accepter la demande' },
  friends: { icon: 'people', label: 'Amis ✓' },
};

/** Hauteur du mini-graphe d'activité hebdo (px). */
const MINI_CHART_H = 56;

/** Bilan victoires/défaites compact d'une liste de matchs : "2V-1D". */
function winLoss(games: { victoire: boolean }[]): string {
  const v = games.filter((g) => g.victoire).length;
  return `${v}V-${games.length - v}D`;
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const qc = useQueryClient();
  const [friendBusy, setFriendBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // L'écran sert aussi à voir SON propre profil : on ne charge les sections « autre joueur »
  // que si l'id consulté n'est pas le mien.
  const otherId = id && id !== myId ? id : undefined;

  // Toutes ces requêtes partent EN PARALLÈLE (react-query) → plus de waterfalling séquentiel.
  const profileQ = useMyProfile(id); // joueur consulté (clé partagée ['profile', id])
  const myProfileQ = useMyProfile(myId); // moi, pour mon n° FFTT (cache partagé avec les autres écrans)
  const matchesQ = usePlayerMatches(otherId, 5);
  const trainingQ = useTrainingStats(otherId);
  const lastSessionQ = useLastTrainingSession(otherId);
  const friendQ = useFriendStatus(myId, otherId);

  const p = profileQ.data ?? null;
  const myFfttId = myProfileQ.data?.fftt_id ?? null;
  // Dependent query native : ne part que si les deux licences existent et diffèrent.
  const commonQ = useFfttCommonOpponents(myFfttId, p?.fftt_id);

  const matches = matchesQ.data ?? [];
  const training = trainingQ.data ?? null;
  const lastSession = lastSessionQ.data ?? null;
  const common = commonQ.data ?? [];
  const friend = friendQ.data ?? 'none';

  async function onFriend() {
    if (!myId || !p) return;
    const key = qk.friends.status(myId, p.id);
    const prev = friend;
    let next: FriendStatus = prev;
    if (prev === 'none') next = 'pending_out';
    else if (prev === 'pending_in') next = 'friends';
    else if (prev === 'friends' || prev === 'pending_out') next = 'none';
    try {
      setFriendBusy(true);
      qc.setQueryData<FriendStatus>(key, next); // maj optimiste du cache
      if (prev === 'none') await sendFriendRequest(myId, p.id);
      else if (prev === 'pending_in') await acceptFriendRequest(myId, p.id);
      else if (prev === 'friends' || prev === 'pending_out') await removeFriend(myId, p.id);
    } catch (e) {
      qc.setQueryData<FriendStatus>(key, prev); // rollback en cas d'échec
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setFriendBusy(false);
    }
  }

  /**
   * Signalement pour fraude (Paul 07/07) : motif choisi dans une feuille (SwipeSheet) → ligne
   * player_reports, visible admin. Feuille plutôt que `choose` : sur le web, `window.confirm`
   * envoyait le signalement même en cliquant « Annuler » (bug designer 16/07).
   */
  async function sendReport(reason: string) {
    if (!myId || !p) return;
    setReportOpen(false);
    try {
      await reportPlayer({ reporterId: myId, reportedId: p.id, reason });
      notify('Signalement envoyé', 'Un admin va y jeter un œil. Merci !');
    } catch (e) {
      notify('Signalement', e instanceof Error ? e.message : 'Réessaie plus tard.');
    }
  }

  const isMe = id === session?.user?.id;
  const elo = p?.elo ?? 0;
  const level = levelForElo(elo);
  const maxWeek = Math.max(1, ...(training?.weekly ?? []).map((w) => w.min));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Profil</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Avatar name={p?.display_name ?? '?'} size={96} uri={p?.avatar_url} />
            <ThemedText type="title" style={styles.name}>
              {p?.display_name ?? '-'}
            </ThemedText>
            {p?.fftt_club ? (
              <View style={styles.heroMetaItem}>
                <Ionicons name="ribbon-outline" size={15} color={Palette.onyx} />
                <ThemedText type="default" themeColor="textSecondary" numberOfLines={1}>
                  {p.fftt_club}
                </ThemedText>
              </View>
            ) : null}
            {p?.city ? (
              <ThemedText type="default" themeColor="textSecondary">
                {p.city}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.eloCard}>
            <View style={styles.eloCol}>
              <ThemedText type="metric" themeColor="brand">
                {elo}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                ELO
              </ThemedText>
            </View>
            <View style={styles.tag}>
              <ThemedText type="smallBold" themeColor="brand">
                {level.label.toUpperCase()}
              </ThemedText>
            </View>
          </View>

          {p?.bio ? (
            <View style={styles.bioCard}>
              <ThemedText type="default">{p.bio}</ThemedText>
            </View>
          ) : null}

          {!isMe && p ? (
            <>
              <Pressable
                style={[
                  styles.friendBtn,
                  friend === 'pending_in' && styles.friendAccept,
                  friend === 'friends' && styles.friendIs,
                ]}
                disabled={friendBusy}
                onPress={onFriend}>
                {friendBusy ? (
                  <ActivityIndicator color={Palette.onyx} />
                ) : (
                  <>
                    <Ionicons
                      name={FRIEND_CFG[friend].icon}
                      size={18}
                      color={friend === 'pending_in' ? Palette.whitePP : Palette.onyx}
                    />
                    <ThemedText type="smallBold" themeColor={friend === 'pending_in' ? 'onBrand' : 'brand'}>
                      {FRIEND_CFG[friend].label}
                    </ThemedText>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.defier}
                onPress={() =>
                  router.push({
                    pathname: '/challenge',
                    params: {
                      opponentId: p.id,
                      opponentName: p.display_name,
                      opponentElo: String(p.elo),
                      opponentCity: p.city ?? '',
                    },
                  })
                }>
                <Ionicons name="flash" size={20} color={Palette.whitePP} />
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Défier
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.messageBtn}
                onPress={() => router.push({ pathname: '/chat', params: { id: p.id, name: p.display_name } })}>
                <Ionicons name="chatbubble-outline" size={18} color={Palette.onyx} />
                <ThemedText type="smallBold">Message</ThemedText>
              </Pressable>

              <Pressable style={styles.reportBtn} onPress={() => setReportOpen(true)} hitSlop={8}>
                <Ionicons name="flag-outline" size={14} color={Palette.grey} />
                <ThemedText type="small" themeColor="textSecondary">
                  Signaler ce joueur
                </ThemedText>
              </Pressable>

              {p.stats_visible !== false && matches.length ? (
                <View style={styles.sectionCard}>
                  <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.sectionTitle}>
                    Derniers matchs
                  </ThemedText>
                  {matches.map((m) => (
                    <Pressable
                      key={m.id}
                      style={styles.matchRow}
                      onPress={() => router.push({ pathname: '/match', params: { id: m.id } })}>
                      <ThemedText type="smallBold" style={styles.matchName} numberOfLines={1}>
                        {m.opponent}
                      </ThemedText>
                      <ThemedText type="small" themeColor={m.won ? 'brand' : 'textSecondary'}>
                        {m.score}
                      </ThemedText>
                      {m.ranked ? (
                        <ThemedText type="smallBold" themeColor={m.delta >= 0 ? 'brand' : 'textMuted'} style={styles.matchDelta}>
                          {m.delta >= 0 ? `+${m.delta}` : m.delta}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textMuted" style={styles.matchDelta}>
                          amical
                        </ThemedText>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {p.stats_visible !== false && training && training.count > 0 ? (
                <View style={styles.sectionCard}>
                  <View style={styles.trainHead}>
                    <ThemedText type="sectionTitle" themeColor="textSecondary">
                      Entraînement
                    </ThemedText>
                    {training.weekMin > 0 ? (
                      <View style={styles.weekTag}>
                        <ThemedText type="smallBold" themeColor="brand">
                          +{formatDuration(training.weekMin)} cette semaine
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.miniChart}>
                    {training.weekly.map((w, i) => (
                      <View key={i} style={styles.chartCol}>
                        <View style={styles.barWrap}>
                          <View
                            style={{
                              width: '60%',
                              height: Math.max(3, (w.min / maxWeek) * MINI_CHART_H),
                              backgroundColor: w.min > 0 ? Palette.purple : Palette.border,
                              borderRadius: 3,
                            }}
                          />
                        </View>
                        <ThemedText type="small" themeColor="textMuted" style={styles.chartLbl}>
                          {w.label}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                  <ThemedText type="small" themeColor="textMuted">
                    {formatDuration(training.totalMinYear)} au total · {training.count} séances cette année
                  </ThemedText>
                </View>
              ) : null}

              {p.stats_visible !== false && lastSession ? (
                <Pressable
                  style={styles.sessionCard}
                  onPress={() => router.push({ pathname: '/session', params: { id: lastSession.id } })}>
                  <View style={styles.sessionHead}>
                    <Ionicons name="fitness-outline" size={16} color={Palette.purple} />
                    <ThemedText type="sectionTitle" themeColor="textSecondary">
                      Dernière séance
                    </ThemedText>
                    <View style={styles.flexFill} />
                    <ThemedText type="small" themeColor="textMuted">
                      {new Date(lastSession.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                  <ThemedText type="cardTitle">
                    {formatDuration(lastSession.duration_min)}
                    {lastSession.feeling ? ` · ${lastSession.feeling}` : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {lastSession.strokes.length ? lastSession.strokes.join(', ') : 'Séance'}
                    {lastSession.venue ? ` · ${lastSession.venue.name}` : ''}
                  </ThemedText>
                </Pressable>
              ) : null}

              {common.length ? (
                <View style={styles.h2hCard}>
                  <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.h2hTitle}>
                    Adversaires communs (FFTT) · {common.length}
                  </ThemedText>
                  {common.slice(0, 12).map((c) => (
                    <View key={c.opponent.numberId} style={styles.h2hRow}>
                      <ThemedText type="smallBold" style={styles.h2hName} numberOfLines={1}>
                        {c.opponent.nom}
                      </ThemedText>
                      <ThemedText type="small" themeColor="brand">
                        Toi {winLoss(c.a)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {'  ·  '}Lui {winLoss(c.b)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {/* Feuille de signalement (web + natif) : « Annuler » n'envoie RIEN. */}
      <SwipeSheet visible={reportOpen} onClose={() => setReportOpen(false)} style={styles.reportSheet}>
        <ThemedText type="cardTitle">Signaler {p?.display_name} ?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.reportSheetSub}>
          Le signalement remonte aux admins Ping Pang Paris.
        </ThemedText>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r.reason} style={styles.reportOption} onPress={() => sendReport(r.reason)}>
            <ThemedText type="smallBold" themeColor={r.destructive ? 'danger' : 'text'}>
              {r.label}
            </ThemedText>
          </Pressable>
        ))}
        <Pressable style={[styles.reportOption, styles.reportCancel]} onPress={() => setReportOpen(false)}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Annuler
          </ThemedText>
        </Pressable>
      </SwipeSheet>
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  hero: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  name: { marginTop: Spacing.two },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, maxWidth: '90%' },
  eloCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  eloCol: { alignItems: 'flex-start' },
  tag: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  bioCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  friendBtn: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  friendAccept: { backgroundColor: Palette.onyx, borderColor: Palette.onyx },
  friendIs: { backgroundColor: Palette.lime, borderColor: Palette.lime },
  defier: {
    marginTop: Spacing.two,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtn: {
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    alignSelf: 'center',
  },
  reportSheet: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  reportSheetSub: { marginBottom: Spacing.two },
  reportOption: {
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  reportCancel: { backgroundColor: 'transparent', marginTop: Spacing.one },
  h2hCard: {
    marginTop: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  h2hTitle: { marginBottom: Spacing.one },
  h2hRow: { flexDirection: 'row', alignItems: 'center' },
  h2hName: { flex: 1 },
  sectionCard: {
    marginTop: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sectionTitle: { marginBottom: Spacing.one },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  matchName: { flex: 1 },
  matchDelta: { minWidth: 48, textAlign: 'right' },
  trainHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTag: {
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  miniChart: { flexDirection: 'row', alignItems: 'flex-end', height: MINI_CHART_H + 18, gap: Spacing.one },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barWrap: { height: MINI_CHART_H, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  chartLbl: { marginTop: Spacing.one, fontSize: 9 },
  sessionCard: {
    marginTop: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flexFill: { flex: 1 },
});
