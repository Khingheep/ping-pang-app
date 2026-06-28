import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { levelForElo } from '@/lib/elo';
import { fetchFfttCommonOpponents, type FfttHeadToHead } from '@/lib/fftt/link';
import { fetchMyProfile, type PlayerProfile } from '@/lib/players/profile';
import {
  acceptFriendRequest,
  getFriendStatus,
  removeFriend,
  sendFriendRequest,
  type FriendStatus,
} from '@/lib/social/friends';
import { notify } from '@/lib/ui/alert';

const FRIEND_CFG: Record<FriendStatus, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  none: { icon: 'person-add-outline', label: 'Ajouter en ami' },
  pending_out: { icon: 'time-outline', label: 'Demande envoyée' },
  pending_in: { icon: 'checkmark-circle', label: 'Accepter la demande' },
  friends: { icon: 'people', label: 'Amis ✓' },
};

/** Bilan victoires/défaites compact d'une liste de matchs : "2V-1D". */
function winLoss(games: { victoire: boolean }[]): string {
  const v = games.filter((g) => g.victoire).length;
  return `${v}V-${games.length - v}D`;
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [myFfttId, setMyFfttId] = useState<string | null>(null);
  const [common, setCommon] = useState<FfttHeadToHead[]>([]);
  const [friend, setFriend] = useState<FriendStatus>('none');
  const [friendBusy, setFriendBusy] = useState(false);

  useEffect(() => {
    if (id) fetchMyProfile(id).then(setP);
  }, [id]);

  useEffect(() => {
    if (myId && id !== myId) fetchMyProfile(myId).then((me) => setMyFfttId(me?.fftt_id ?? null));
  }, [myId, id]);

  useEffect(() => {
    if (id && myId && id !== myId) getFriendStatus(myId, id).then(setFriend);
  }, [id, myId]);

  // Adversaires communs FFTT : si les deux joueurs ont une licence liée.
  useEffect(() => {
    const theirFftt = p?.fftt_id;
    if (myFfttId && theirFftt && myFfttId !== theirFftt) {
      fetchFfttCommonOpponents(myFfttId, theirFftt).then(setCommon).catch(() => {});
    } else {
      setCommon([]);
    }
  }, [myFfttId, p?.fftt_id]);

  async function onFriend() {
    if (!myId || !p) return;
    try {
      setFriendBusy(true);
      if (friend === 'none') {
        await sendFriendRequest(myId, p.id);
        setFriend('pending_out');
      } else if (friend === 'pending_in') {
        await acceptFriendRequest(myId, p.id);
        setFriend('friends');
      } else if (friend === 'friends' || friend === 'pending_out') {
        await removeFriend(myId, p.id);
        setFriend('none');
      }
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setFriendBusy(false);
    }
  }

  const isMe = id === session?.user?.id;
  const elo = p?.elo ?? 0;
  const level = levelForElo(elo);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Profil</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Avatar name={p?.display_name ?? '?'} size={96} uri={p?.avatar_url} />
            <ThemedText type="title" style={styles.name}>
              {p?.display_name ?? '—'}
            </ThemedText>
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

          {p?.play_style || p?.handedness ? (
            <View style={styles.infoRow}>
              {p?.play_style ? (
                <View style={styles.infoCard}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Style
                  </ThemedText>
                  <ThemedText type="cardTitle">{p.play_style}</ThemedText>
                </View>
              ) : null}
              {p?.handedness ? (
                <View style={styles.infoCard}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Main
                  </ThemedText>
                  <ThemedText type="cardTitle">{p.handedness}</ThemedText>
                </View>
              ) : null}
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
                  <ActivityIndicator color={Palette.evergreen} />
                ) : (
                  <>
                    <Ionicons
                      name={FRIEND_CFG[friend].icon}
                      size={18}
                      color={friend === 'pending_in' ? Palette.whitePP : Palette.evergreen}
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
                  router.push({ pathname: '/new-match', params: { opponentId: p.id, opponentName: p.display_name } })
                }>
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Défier (saisir un match)
                </ThemedText>
              </Pressable>
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/chat', params: { id: p.id, name: p.display_name } })}>
                  <Ionicons name="chatbubble-outline" size={18} color={Palette.onyx} />
                  <ThemedText type="smallBold">Message</ThemedText>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
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
                  <Ionicons name="flash-outline" size={18} color={Palette.onyx} />
                  <ThemedText type="smallBold">Défier</ThemedText>
                </Pressable>
              </View>

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
  infoRow: { flexDirection: 'row', gap: Spacing.two },
  infoCard: {
    flex: 1,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.half,
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
    borderColor: Palette.evergreen,
  },
  friendAccept: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  friendIs: { backgroundColor: Palette.lime, borderColor: Palette.lime },
  defier: {
    marginTop: Spacing.two,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  actionRow: { flexDirection: 'row', gap: Spacing.two },
  actionBtn: {
    flex: 1,
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
});
