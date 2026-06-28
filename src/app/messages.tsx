import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { searchPlayers, type PlayerSearchResult } from '@/lib/players/profile';
import { confirm, notify } from '@/lib/ui/alert';
import {
  blockUser,
  clearConversation,
  fetchConversations,
  setConversationArchived,
  subscribeIncomingMessages,
  type Conversation,
} from '@/lib/social/messages';

export default function MessagesScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Conversation ciblée par l'action-sheet (long-press), ou null si fermé.
  const [sheet, setSheet] = useState<Conversation | null>(null);
  // Recherche de joueurs à qui écrire.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    if (!myId) return;
    setConvos(await fetchConversations(myId, { archived: showArchived }));
  }, [myId, showArchived]);

  // Recharge à chaque focus de l'écran.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Temps réel : un nouveau message reçu rafraîchit la liste sans quitter l'écran.
  useEffect(() => {
    if (!myId) return;
    const unsub = subscribeIncomingMessages(myId, () => {
      void load();
    });
    return unsub;
  }, [myId, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Recherche debouncée : query → joueurs correspondants. `searchSeq` ignore les réponses périmées.
  useEffect(() => {
    const q = query.trim();
    if (!myId || !q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const found = await searchPlayers(myId, q);
        if (seq === searchSeq.current) setResults(found);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, myId]);

  const openChat = useCallback((id: string, name: string) => {
    setQuery('');
    setResults([]);
    router.push({ pathname: '/chat', params: { id, name } });
  }, []);

  // ───────── Actions de l'action-sheet ─────────
  const doArchive = useCallback(
    async (c: Conversation) => {
      setSheet(null);
      if (!myId) return;
      try {
        await setConversationArchived(myId, c.otherId, !c.archived);
        await load();
      } catch {
        notify('Oups', "L'action n'a pas pu être effectuée.");
      }
    },
    [myId, load],
  );

  const doDelete = useCallback(
    async (c: Conversation) => {
      setSheet(null);
      if (!myId) return;
      if (
        !(await confirm({
          title: 'Supprimer la conversation ?',
          message: `Les messages avec ${c.otherName || 'ce joueur'} disparaîtront de ton côté.`,
          confirmText: 'Supprimer',
          destructive: true,
        }))
      )
        return;
      try {
        await clearConversation(myId, c.otherId);
        await load();
      } catch {
        notify('Oups', "La conversation n'a pas pu être supprimée.");
      }
    },
    [myId, load],
  );

  const doBlock = useCallback(
    async (c: Conversation) => {
      setSheet(null);
      if (!myId) return;
      if (
        !(await confirm({
          title: `Bloquer ${c.otherName || 'ce joueur'} ?`,
          message: 'Il ne pourra plus t’envoyer de messages et disparaîtra de ta liste.',
          confirmText: 'Bloquer',
          destructive: true,
        }))
      )
        return;
      try {
        await blockUser(myId, c.otherId);
        await load();
      } catch {
        notify('Oups', "Le joueur n'a pas pu être bloqué.");
      }
    },
    [myId, load],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Messages</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        {/* Recherche de joueurs à qui écrire */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Palette.grey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un joueur…"
            placeholderTextColor={Palette.grey}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Palette.grey} />
            </Pressable>
          )}
        </View>

        {query.trim() ? (
          // ───────── Mode recherche : résultats joueurs ─────────
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {searching && results.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Recherche…
              </ThemedText>
            ) : results.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Aucun joueur trouvé.
              </ThemedText>
            ) : (
              results.map((p) => (
                <Pressable key={p.id} style={styles.row} onPress={() => openChat(p.id, p.name)}>
                  <Avatar name={p.name} uri={p.avatarUrl} size={48} />
                  <View style={styles.main}>
                    <ThemedText type="cardTitle">{p.name}</ThemedText>
                  </View>
                  <Ionicons name="chatbubble-outline" size={20} color={Palette.evergreen} />
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : (
          <>
            {/* Bascule Actives / Archivées */}
            <View style={styles.segment}>
              <Pressable
                style={[styles.segmentBtn, !showArchived && styles.segmentBtnActive]}
                onPress={() => setShowArchived(false)}>
                <ThemedText type="small" themeColor={!showArchived ? 'onBrand' : 'textSecondary'}>
                  Actives
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.segmentBtn, showArchived && styles.segmentBtnActive]}
                onPress={() => setShowArchived(true)}>
                <ThemedText type="small" themeColor={showArchived ? 'onBrand' : 'textSecondary'}>
                  Archivées
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.scroll}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Palette.evergreen} />}>
              {convos.length === 0 ? (
                <ThemedText type="small" themeColor="textMuted">
                  {showArchived
                    ? 'Aucune conversation archivée.'
                    : 'Aucune conversation. Recherche un joueur ci-dessus pour lui écrire.'}
                </ThemedText>
              ) : (
                convos.map((c) => (
                  <Pressable
                    key={c.otherId}
                    style={styles.row}
                    onPress={() => router.push({ pathname: '/chat', params: { id: c.otherId, name: c.otherName } })}
                    onLongPress={() => setSheet(c)}
                    delayLongPress={300}>
                    <Avatar name={c.otherName || '?'} size={48} />
                    <View style={styles.main}>
                      <ThemedText type="cardTitle">{c.otherName || 'Joueur'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {c.lastBody}
                      </ThemedText>
                    </View>
                    <Ionicons name="ellipsis-horizontal" size={20} color={Palette.grey} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      {/* Action-sheet (cross-platform : marche aussi sur la PWA web) */}
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="cardTitle" style={styles.sheetTitle}>
              {sheet?.otherName || 'Conversation'}
            </ThemedText>

            <Pressable style={styles.action} onPress={() => sheet && doArchive(sheet)}>
              <Ionicons name={sheet?.archived ? 'archive-outline' : 'archive'} size={22} color={Palette.onyx} />
              <ThemedText type="default">{sheet?.archived ? 'Désarchiver' : 'Archiver'}</ThemedText>
            </Pressable>

            <Pressable style={styles.action} onPress={() => sheet && doDelete(sheet)}>
              <Ionicons name="trash-outline" size={22} color={Palette.redInk} />
              <ThemedText type="default" style={{ color: Palette.redInk }}>
                Supprimer la conversation
              </ThemedText>
            </Pressable>

            <Pressable style={styles.action} onPress={() => sheet && doBlock(sheet)}>
              <Ionicons name="ban-outline" size={22} color={Palette.redInk} />
              <ThemedText type="default" style={{ color: Palette.redInk }}>
                Bloquer le joueur
              </ThemedText>
            </Pressable>

            <Pressable style={[styles.action, styles.cancel]} onPress={() => setSheet(null)}>
              <ThemedText type="default" themeColor="textSecondary">
                Annuler
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.three,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
    color: Palette.onyx,
  },
  segment: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    padding: Spacing.one,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  segmentBtnActive: { backgroundColor: Palette.evergreen },
  scroll: { paddingHorizontal: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  main: { flex: 1 },
  // Action-sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Palette.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.one,
  },
  sheetTitle: { textAlign: 'center', marginBottom: Spacing.two },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  cancel: { justifyContent: 'center', marginTop: Spacing.one },
});
