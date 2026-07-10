import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { fetchNotifications, markAllRead, markRead, notifRoute, type Notif } from '@/lib/social/notifications';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  challenge: 'flash',
  message: 'chatbubble',
  match: 'tennisball',
  match_confirm: 'help-circle',
  match_confirmed: 'checkmark-circle',
  match_disputed: 'alert-circle',
  match_like: 'heart',
  match_comment: 'chatbubble-ellipses',
  friend_request: 'person-add',
  friend_accepted: 'people',
  slot: 'calendar',
  slot_join: 'calendar-outline',
  session_like: 'heart',
  session_comment: 'chatbubble-ellipses',
};

// Route cible au tap, selon le type + l'entité portée par `data`. null = non navigable.
function targetFor(n: Notif): Parameters<typeof router.push>[0] | null {
  return notifRoute(n.type, n.data) as Parameters<typeof router.push>[0] | null;
}

function rel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days}j`;
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notif[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications().then(setItems);
    }, []),
  );

  async function readAll() {
    await markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function open(n: Notif) {
    const target = targetFor(n);
    if (!n.read) {
      markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (target) router.push(target);
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Notifications</ThemedText>
          <Pressable onPress={readAll} hitSlop={12}>
            <ThemedText type="smallBold" themeColor="brand">
              Tout lire
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              Aucune notification.
            </ThemedText>
          ) : (
            items.map((n) => {
              const navigable = targetFor(n) !== null;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => open(n)}
                  disabled={!navigable}
                  style={({ pressed }) => [styles.row, !n.read && styles.unread, pressed && navigable && styles.pressed]}
                >
                  <View style={styles.icon}>
                    <Ionicons name={ICON[n.type] ?? 'notifications'} size={18} color={Palette.evergreen} />
                  </View>
                  <View style={styles.main}>
                    <ThemedText type="cardTitle">{n.title}</ThemedText>
                    {n.body ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {n.body}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textMuted">
                    {rel(n.created_at)}
                  </ThemedText>
                  {navigable ? <Ionicons name="chevron-forward" size={16} color={Palette.grey} /> : null}
                </Pressable>
              );
            })
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
  unread: { borderColor: Palette.onyx },
  pressed: { opacity: 0.6 },
  icon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1 },
});
