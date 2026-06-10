import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchConversations, type Conversation } from '@/lib/social/messages';

export default function MessagesScreen() {
  const { session } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (id) fetchConversations(id).then(setConvos);
    }, [session?.user?.id]),
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
        <ScrollView contentContainerStyle={styles.scroll}>
          {convos.length === 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              Aucune conversation. Va sur le profil d&apos;un joueur pour lui écrire.
            </ThemedText>
          ) : (
            convos.map((c) => (
              <Pressable
                key={c.otherId}
                style={styles.row}
                onPress={() => router.push({ pathname: '/chat', params: { id: c.otherId, name: c.otherName } })}>
                <Avatar name={c.otherName || '?'} size={48} />
                <View style={styles.main}>
                  <ThemedText type="cardTitle">{c.otherName || 'Joueur'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {c.lastBody}
                  </ThemedText>
                </View>
              </Pressable>
            ))
          )}
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
});
