import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { fetchEvents, fetchVenues, type EventPP, type Venue } from '@/lib/venues/venues';

const FILTERS = ['Tout', 'Intérieur', 'Extérieur'];

function eventDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function CarteScreen() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<EventPP[]>([]);
  const [filter, setFilter] = useState(0);

  useFocusEffect(
    useCallback(() => {
      fetchVenues().then(setVenues);
      fetchEvents().then(setEvents);
    }, []),
  );

  const filtered = venues.filter((v) =>
    filter === 0 ? true : filter === 1 ? v.indoor : v.indoor === false,
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Carte</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
            Trouve une table près de toi.
          </ThemedText>

          <View style={styles.filters}>
            {FILTERS.map((f, i) => (
              <PressablePill key={f} active={filter === i} label={f} onPress={() => setFilter(i)} />
            ))}
          </View>

          <View style={styles.list}>
            {filtered.map((v) => (
              <View key={v.id} style={styles.venueCard}>
                <View style={[styles.pin, { backgroundColor: v.indoor ? Palette.blue : Palette.lime }]}>
                  <Ionicons name={v.indoor ? 'home' : 'sunny'} size={18} color={Palette.onyx} />
                </View>
                <View style={styles.venueMain}>
                  <ThemedText type="cardTitle">{v.name}</ThemedText>
                  {v.address ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {v.address}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" themeColor="textMuted">
                  {v.indoor ? 'Intérieur' : 'Extérieur'}
                </ThemedText>
              </View>
            ))}
            {filtered.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Aucun lieu pour ce filtre.
              </ThemedText>
            ) : null}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Événements à venir
          </ThemedText>
          <View style={styles.list}>
            {events.map((e) => (
              <View key={e.id} style={styles.eventCard}>
                <View style={styles.eventMain}>
                  <ThemedText type="cardTitle">{e.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {eventDate(e.starts_at)}
                    {e.venue ? ` · ${e.venue.name}` : ''}
                  </ThemedText>
                </View>
                {e.spots_left != null ? (
                  <View style={styles.spots}>
                    <ThemedText type="smallBold" themeColor="brand">
                      {e.spots_left} places
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ))}
            {events.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Aucun événement programmé.
              </ThemedText>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PressablePill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}>
      <ThemedText type="smallBold" themeColor={active ? 'onBrand' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.three },
  filters: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four },
  pill: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.evergreen },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  list: { gap: Spacing.two },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  pin: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  venueMain: { flex: 1 },
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  eventMain: { flex: 1 },
  spots: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
