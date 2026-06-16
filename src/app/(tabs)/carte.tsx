import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { VenueMap, type VenueMapHandle } from '@/components/venue-map';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { fetchUpcomingSlots, slotTimeLabel, type Slot } from '@/lib/slots/slots';
import { fetchEvents, fetchVenues, type EventPP, type Venue } from '@/lib/venues/venues';

const FILTERS = ['Tout', 'Intérieur', 'Extérieur'];
const MAP_HEIGHT = 300;

function eventDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function CarteScreen() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<EventPP[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [filter, setFilter] = useState(0);
  const mapRef = useRef<VenueMapHandle>(null);
  const filterRef = useRef(0); // évite une closure obsolète dans onMapReady

  useFocusEffect(
    useCallback(() => {
      fetchVenues().then(setVenues);
      fetchEvents().then(setEvents);
      fetchUpcomingSlots(20).then(setSlots);
    }, []),
  );

  const filtered = venues.filter((v) => (filter === 0 ? true : filter === 1 ? v.indoor : v.indoor === false));

  // Le filtre agit sur la liste ET sur la map (masque/affiche les marqueurs, sans recharger).
  const selectFilter = useCallback((i: number) => {
    filterRef.current = i;
    setFilter(i);
    mapRef.current?.applyFilter(i);
  }, []);

  // À chaque (re)chargement de la map, on ré-applique le filtre courant.
  const onMapReady = useCallback(() => mapRef.current?.applyFilter(filterRef.current), []);

  const openVenue = useCallback((v: Venue) => {
    router.push({
      pathname: '/venue',
      params: { id: v.id, name: v.name, address: v.address ?? '', indoor: String(!!v.indoor) },
    });
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <ThemedText type="title">Carte</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
            Trouve une table près de toi.
          </ThemedText>
        </View>

        <View style={styles.mapWrap}>
          <VenueMap ref={mapRef} venues={venues} onReady={onMapReady} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.filters}>
            {FILTERS.map((f, i) => (
              <PressablePill key={f} active={filter === i} label={f} onPress={() => selectFilter(i)} />
            ))}
          </View>

          <View style={styles.list}>
            {filtered.map((v) => (
              <Pressable key={v.id} style={styles.venueCard} onPress={() => openVenue(v)}>
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
                <Ionicons name="chevron-forward" size={16} color={Palette.grey} />
              </Pressable>
            ))}
            {filtered.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Aucun lieu pour ce filtre.
              </ThemedText>
            ) : null}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Créneaux à venir{slots.length ? ` (${slots.length})` : ''}
          </ThemedText>
          <View style={styles.list}>
            {slots.map((s) => (
              <Pressable
                key={s.id}
                style={styles.slotRow}
                onPress={() => router.push({ pathname: '/venue', params: { id: s.venueId, name: s.venueName } })}>
                <Avatar name={s.hostName} size={36} color={Palette.purple} />
                <View style={styles.venueMain}>
                  <ThemedText type="cardTitle" numberOfLines={1}>
                    {s.hostName} · {s.venueName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {slotTimeLabel(s.startsAt, s.endsAt)}
                  </ThemedText>
                </View>
                <View style={styles.spots}>
                  <ThemedText type="smallBold" themeColor="brand">
                    {s.participants.length} 👥
                  </ThemedText>
                </View>
              </Pressable>
            ))}
            {slots.length === 0 ? (
              <ThemedText type="small" themeColor="textMuted">
                Aucun créneau proposé. Ouvre un lieu pour en créer un !
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
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.three },
  mapWrap: {
    height: MAP_HEIGHT,
    marginHorizontal: Spacing.four,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.whitePP,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: BottomTabInset + Spacing.five },
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
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
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
