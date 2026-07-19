/**
 * Écran « Aces » (Figma « view like the post ») : liste des joueurs qui ont mis un ace
 * (= aimé) une publication (séance ou match), chacun avec un bouton « Suivre » qui mappe
 * sur le système d'amis existant (demande d'ami mutuelle). Ouvert au clic sur le compteur
 * d'aces du focus post. Route : /aces?kind=session|match&id=<id>
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchMatchLikers } from '@/lib/matches/social';
import { qk } from '@/lib/query/keys';
import { acceptFriendRequest, removeFriend, sendFriendRequest, useFriendStatus, type FriendStatus } from '@/lib/social/friends';
import { fetchSessionLikers } from '@/lib/training/sessions';

type Liker = { id: string; name: string; avatarUrl: string | null; elo: number };

// Libellé + style du bouton selon le statut d'amitié (le mot « Suivre » = demande d'ami).
const FRIEND_CFG: Record<FriendStatus, { label: string; primary: boolean }> = {
  none: { label: 'Suivre', primary: true },
  pending_in: { label: 'Accepter', primary: true },
  pending_out: { label: 'Demandé', primary: false },
  friends: { label: 'Amis ✓', primary: false },
};

/** Bouton d'amitié d'une ligne : Suivre / Accepter / Demandé / Amis ✓. */
function FriendButton({ myId, otherId }: { myId: string; otherId: string }) {
  const qc = useQueryClient();
  const statusQ = useFriendStatus(myId, otherId);
  const [busy, setBusy] = useState(false);
  const status = statusQ.data ?? 'none';
  const cfg = FRIEND_CFG[status];

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      if (status === 'none') await sendFriendRequest(myId, otherId);
      else if (status === 'pending_in') await acceptFriendRequest(myId, otherId);
      else await removeFriend(myId, otherId); // pending_out = annuler, friends = retirer
      await qc.invalidateQueries({ queryKey: qk.friends.status(myId, otherId) });
      void qc.invalidateQueries({ queryKey: qk.friends.ids(myId) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={[styles.followBtn, cfg.primary ? styles.followPrimary : styles.followIdle]}
      onPress={onPress}
      disabled={busy || statusQ.isLoading}>
      {busy ? (
        <ActivityIndicator size="small" color={cfg.primary ? Palette.whitePP : Palette.onyx} />
      ) : (
        <ThemedText type="smallBold" themeColor={cfg.primary ? 'onBrand' : 'text'}>
          {cfg.label}
        </ThemedText>
      )}
    </Pressable>
  );
}

export default function AcesScreen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const run = kind === 'match' ? fetchMatchLikers : fetchSessionLikers;
    run(id).then((l) => {
      setLikers(l);
      setLoading(false);
    });
  }, [id, kind]);

  const renderItem = useCallback(
    ({ item: l }: { item: Liker }) => (
      <Pressable style={styles.row} onPress={() => router.push({ pathname: '/player', params: { id: l.id } })}>
        <Avatar name={l.name} uri={l.avatarUrl} size={44} />
        <View style={styles.rowMain}>
          <ThemedText type="cardTitle" numberOfLines={1}>
            {l.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ELO {l.elo}
          </ThemedText>
        </View>
        {myId && l.id !== myId ? <FriendButton myId={myId} otherId={l.id} /> : null}
      </Pressable>
    ),
    [myId],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Aces</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.onyx} />
          </View>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(l) => l.id}
            renderItem={renderItem}
            contentContainerStyle={styles.scroll}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
                Aucun ace pour l’instant.
              </ThemedText>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  sep: { height: Spacing.two },
  empty: { marginTop: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowMain: { flex: 1 },
  followBtn: {
    minWidth: 96,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followPrimary: { backgroundColor: Palette.onyx },
  followIdle: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
});
