/**
 * Onglet « Parties » - discovery des lieux où jouer (façon TheFork) : une CARTE de base toujours
 * ouverte en haut + le FEED de cartes de lieux en dessous (pas de toggle). Carte et liste sont
 * synchronisées : les pins = les lieux du feed, un tap de carte recadre la carte, un tap de pin
 * ouvre la même bottom-sheet.
 *
 * Curation implicite : on n'affiche que les lieux qui ont des créneaux ouverts + une section
 * « Autour de toi » de clubs curatés où proposer - pas le dump des 267 tables OSM. Chaque carte de
 * lieu porte sa « photo » = une vignette carte statique centrée (cf. venue-card.tsx).
 *
 * Données via react-query : créneaux à venir + clubs curatés, rafraîchis au focus.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { VenueCard } from '@/components/venue-card';
import { VenueMap, type MapPoint, type VenueMapHandle } from '@/components/venue-map';
import { VenueSheet } from '@/components/venue-sheet';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { useUserLocation } from '@/lib/location/use-location';
import { useHomeVenue } from '@/lib/players/profile';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useUpcomingSlots } from '@/lib/slots/slots';
import { buildDiscover, buildVenueFeed, filterSlotsByPlace, type PlaceFilter, type VenueFeedEntry } from '@/lib/venues/feed';
import { useFeaturedVenues } from '@/lib/venues/venues';

const MAP_H = Math.round(Dimensions.get('window').height * 0.36);

const PLACE_FILTERS: { key: PlaceFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'indoor', label: 'Intérieur' },
  { key: 'outdoor', label: 'Extérieur' },
];

export default function PartiesScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const { coords } = useUserLocation();
  const mapRef = useRef<VenueMapHandle>(null);

  const [place, setPlace] = useState<PlaceFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const slotsQ = useUpcomingSlots(200);
  const homeQ = useHomeVenue(myId);
  const featuredQ = useFeaturedVenues();

  useRefreshOnFocus(slotsQ.refetch);
  useRefreshOnFocus(homeQ.refetch);
  useRefreshOnFocus(featuredQ.refetch);

  const homeVenue = homeQ.data ?? null;

  // Feed : créneaux filtrés (intérieur/extérieur) → regroupés par lieu → triés par distance.
  const feed = useMemo(
    () => buildVenueFeed(filterSlotsByPlace(slotsQ.data ?? [], place), coords),
    [slotsQ.data, place, coords],
  );

  // « Autour de toi » : clubs curatés sans créneau ouvert, filtrés par lieu, triés par distance.
  const discover = useMemo(() => {
    const featured = (featuredQ.data ?? []).filter((v) =>
      place === 'all' ? true : place === 'indoor' ? !!v.indoor : !v.indoor,
    );
    return buildDiscover(featured, coords, new Set(feed.map((f) => f.id)), 8);
  }, [featuredQ.data, place, coords, feed]);

  // Pins de la carte = exactement ce que montre la liste (feed + clubs à découvrir).
  const points = useMemo<MapPoint[]>(() => {
    const fromFeed: MapPoint[] = feed
      .filter((f) => f.lat != null && f.lng != null)
      .map((f) => ({ id: f.id, lat: f.lat as number, lng: f.lng as number, name: f.name, address: f.address, indoor: f.indoor, slots: f.slots.length }));
    const fromDiscover: MapPoint[] = discover
      .filter((d) => d.lat != null && d.lng != null)
      .map((d) => ({ id: d.id, lat: d.lat as number, lng: d.lng as number, name: d.name, address: d.address, indoor: d.indoor, slots: 0 }));
    return [...fromFeed, ...fromDiscover];
  }, [feed, discover]);

  // Sélection (carte ou liste) : on ouvre la sheet et on recadre la carte sur le lieu.
  const select = useCallback((id: string, lat?: number | null, lng?: number | null) => {
    setSelected(id);
    if (lat != null && lng != null) mapRef.current?.focusAt(lat, lng);
  }, []);

  function goToClub() {
    if (homeVenue) {
      if (homeVenue.lat != null && homeVenue.lng != null) mapRef.current?.focusAt(homeVenue.lat, homeVenue.lng);
      setSelected(homeVenue.id);
    } else {
      router.push('/profile');
    }
  }

  const renderCard = useCallback(
    ({ item }: { item: VenueFeedEntry }) => (
      <VenueCard
        name={item.name}
        address={item.address}
        indoor={item.indoor}
        lat={item.lat}
        lng={item.lng}
        distanceKm={item.distanceKm}
        slots={item.slots}
        players={item.players}
        onPress={() => select(item.id, item.lat, item.lng)}
      />
    ),
    [select],
  );

  return (
    <View style={styles.root}>
      {/* Carte de base, toujours ouverte */}
      <View style={[styles.mapWrap, { height: MAP_H + insets.top, paddingTop: insets.top }]}>
        <VenueMap ref={mapRef} points={points} user={coords} onSelectVenue={(id) => select(id, undefined, undefined)} />

        <Pressable style={[styles.clubChip, { top: insets.top + Spacing.two }]} onPress={goToClub} hitSlop={6}>
          <Ionicons name={homeVenue ? 'home' : 'add-circle-outline'} size={16} color={Palette.evergreen} />
          <ThemedText type="smallBold" themeColor="brand" numberOfLines={1} style={styles.clubChipText}>
            {homeVenue ? homeVenue.name : 'Définir mon club'}
          </ThemedText>
        </Pressable>

        {coords ? (
          <Pressable style={styles.locate} onPress={() => mapRef.current?.flyTo(coords.lat, coords.lng, 15)} hitSlop={8}>
            <Ionicons name="locate" size={20} color={Palette.evergreen} />
          </Pressable>
        ) : null}
      </View>

      {/* Feed, sous la carte (coins arrondis qui chevauchent légèrement) */}
      <View style={styles.sheet}>
        <FlatList
          data={feed}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={slotsQ.isFetching}
          onRefresh={() => {
            void slotsQ.refetch();
            void featuredQ.refetch();
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="subtitle">Où jouer ?</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {feed.length ? `${feed.length} lieu${feed.length > 1 ? 'x' : ''} réservable${feed.length > 1 ? 's' : ''} près de toi` : 'Réserve une table près de toi'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.filters}>
                {PLACE_FILTERS.map((f) => {
                  const active = place === f.key;
                  return (
                    <Pressable key={f.key} style={[styles.filterChip, active && styles.filterChipOn]} onPress={() => setPlace(f.key)} hitSlop={4}>
                      <ThemedText type="smallBold" themeColor={active ? 'onBrand' : 'brand'}>
                        {f.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={36} color={Palette.grey} />
              <ThemedText type="cardTitle" style={styles.emptyTitle}>
                Aucun créneau ouvert pour l’instant
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Sois le premier à proposer une partie - choisis un lieu ci-dessous.
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            discover.length ? (
              <View style={styles.discover}>
                <ThemedText type="sectionTitle" style={styles.discoverTitle}>
                  Autour de toi
                </ThemedText>
                <View style={{ gap: Spacing.three }}>
                  {discover.map((d) => (
                    <VenueCard
                      key={d.id}
                      name={d.name}
                      address={d.address}
                      indoor={d.indoor}
                      lat={d.lat}
                      lng={d.lng}
                      distanceKm={d.distanceKm}
                      onPress={() => select(d.id, d.lat, d.lng)}
                    />
                  ))}
                </View>
              </View>
            ) : null
          }
        />
      </View>

      <VenueSheet
        venueId={selected}
        onClose={() => {
          setSelected(null);
          void slotsQ.refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  mapWrap: { width: '100%', backgroundColor: Palette.whitePP },
  sheet: {
    flex: 1,
    backgroundColor: Palette.whitePP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    marginTop: -Spacing.three, // chevauche la carte
    overflow: 'hidden',
    // léger relief pour détacher le feed de la carte
    shadowColor: Palette.onyx,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  listContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  header: { gap: Spacing.three, marginBottom: Spacing.one },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  filters: { flexDirection: 'row', gap: Spacing.two },
  filterChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  filterChipOn: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  empty: { alignItems: 'center', paddingVertical: Spacing.six, gap: Spacing.two },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 280 },
  discover: { marginTop: Spacing.four, gap: Spacing.three },
  discoverTitle: {},
  clubChip: {
    position: 'absolute',
    left: Spacing.four,
    maxWidth: '60%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.whitePP,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    shadowColor: Palette.onyx,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  clubChipText: { flexShrink: 1 },
  locate: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.whitePP,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.onyx,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
});
