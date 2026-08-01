/**
 * Onglet « Parties » — CARTE PLEIN ÉCRAN + bottom-sheet GLISSABLE par-dessus.
 * Le bandeau (poignée + titre) se drague pour dérouler la feuille : replié (« peek ») la carte
 * est quasi plein écran et navigable ; déplié on voit les créneaux + lieux « Autour de toi ».
 * Rangée de CTA rapides : créer un défi · tables proches · joueurs proches.
 *
 * Carte et liste synchronisées : les pins = les lieux du cadre visible, un tap de pin ouvre le
 * détail (VenueSheet) dans la feuille. Données via react-query (créneaux + clubs curatés).
 */

import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { VenueCard } from '@/components/venue-card';
import { VenueMap, type Bbox, type MapPoint, type VenueMapHandle } from '@/components/venue-map';
import { VenueSheet } from '@/components/venue-sheet';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { useUserLocation } from '@/lib/location/use-location';
import { useHomeVenue } from '@/lib/players/profile';
import { useRefreshOnFocus } from '@/lib/query/use-refresh-on-focus';
import { useUpcomingSlots } from '@/lib/slots/slots';
import { buildDiscover, buildVenueFeed, filterSlotsByPlace, type PlaceFilter, type VenueFeedEntry } from '@/lib/venues/feed';
import { useVenuesInBbox } from '@/lib/venues/venues';

const USE_NATIVE = Platform.OS !== 'web';
const PEEK_RATIO = 0.42; // part de l'écran visible quand la feuille est repliée
const SHEET_RATIO = 0.9; // hauteur max de la feuille dépliée

const PLACE_FILTERS: { key: PlaceFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'indoor', label: 'Intérieur' },
  { key: 'outdoor', label: 'Extérieur' },
];

function CtaButton({ icon, label, primary, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.cta, primary && styles.ctaPrimary]} onPress={onPress} hitSlop={4}>
      <Ionicons name={icon} size={20} color={Palette.onyx} />
      <ThemedText type="smallBold" themeColor="brand" numberOfLines={2} style={styles.ctaLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function PartiesScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const { coords } = useUserLocation();
  const mapRef = useRef<VenueMapHandle>(null);

  const [place, setPlace] = useState<PlaceFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);

  // ── Bottom-sheet glissable : 2 positions (repliée « peek » / dépliée) ──
  const [dims, setDims] = useState({ sheetH: 0, peekH: 0, peekY: 0 });
  const translateY = useRef(new Animated.Value(99999)).current; // hors écran tant que non mesuré
  const geom = useRef({ peekY: 0 });
  const dragBase = useRef(0);
  const expandedRef = useRef(false);
  const initedRef = useRef(false);

  const snapTo = useCallback(
    (expand: boolean) => {
      expandedRef.current = expand;
      Animated.spring(translateY, {
        toValue: expand ? 0 : geom.current.peekY,
        useNativeDriver: USE_NATIVE,
        friction: 12,
        tension: 80,
      }).start();
    },
    [translateY],
  );

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        dragBase.current = expandedRef.current ? 0 : geom.current.peekY;
      },
      onPanResponderMove: (_e, g) => {
        translateY.setValue(Math.min(geom.current.peekY, Math.max(0, dragBase.current + g.dy)));
      },
      onPanResponderRelease: (_e, g) => {
        const cur = dragBase.current + g.dy;
        snapTo(g.vy < -0.4 || (g.vy <= 0.4 && cur < geom.current.peekY / 2));
      },
    }),
  ).current;

  const onRootLayout = useCallback(
    (h: number) => {
      if (!h || h === dims.sheetH / SHEET_RATIO) return;
      const sheetH = Math.round(h * SHEET_RATIO);
      const peekH = Math.round(h * PEEK_RATIO);
      const peekY = sheetH - peekH;
      geom.current = { peekY };
      setDims({ sheetH, peekH, peekY });
      if (!initedRef.current) {
        translateY.setValue(peekY);
        initedRef.current = true;
      }
    },
    [dims.sheetH, translateY],
  );

  const slotsQ = useUpcomingSlots(200);
  const homeQ = useHomeVenue(myId);
  const venuesQ = useVenuesInBbox(bbox);

  useRefreshOnFocus(slotsQ.refetch);
  useRefreshOnFocus(homeQ.refetch);

  const homeVenue = homeQ.data ?? null;

  const feed = useMemo(
    () => buildVenueFeed(filterSlotsByPlace(slotsQ.data ?? [], place), coords),
    [slotsQ.data, place, coords],
  );

  const bboxVenues = useMemo(
    () => (venuesQ.data ?? []).filter((v) => (place === 'all' ? true : place === 'indoor' ? !!v.indoor : !v.indoor)),
    [venuesQ.data, place],
  );

  const discover = useMemo(
    () => buildDiscover(bboxVenues.filter((v) => v.source !== 'openstreetmap'), coords, new Set(feed.map((f) => f.id)), 30),
    [bboxVenues, coords, feed],
  );

  const points = useMemo<MapPoint[]>(() => {
    const feedIds = new Set(feed.map((f) => f.id));
    const fromFeed: MapPoint[] = feed
      .filter((f) => f.lat != null && f.lng != null)
      .map((f) => ({ id: f.id, lat: f.lat as number, lng: f.lng as number, name: f.name, address: f.address, indoor: f.indoor, slots: f.slots.length }));
    const fromVenues: MapPoint[] = bboxVenues
      .filter((v) => v.lat != null && v.lng != null && !feedIds.has(v.id))
      .map((v) => ({ id: v.id, lat: v.lat as number, lng: v.lng as number, name: v.name, address: v.address, indoor: v.indoor, slots: 0 }));
    return [...fromFeed, ...fromVenues];
  }, [feed, bboxVenues]);

  // Sélection (carte ou liste) : ouvre le détail + recadre + déplie la feuille.
  const select = useCallback(
    (id: string, lat?: number | null, lng?: number | null) => {
      setSelected(id);
      if (lat != null && lng != null) mapRef.current?.focusAt(lat, lng);
      snapTo(true);
    },
    [snapTo],
  );

  function goToClub() {
    if (homeVenue) {
      if (homeVenue.lat != null && homeVenue.lng != null) mapRef.current?.focusAt(homeVenue.lat, homeVenue.lng);
      setSelected(homeVenue.id);
      snapTo(true);
    } else {
      router.push('/profil' as Href);
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
    <View style={styles.root} onLayout={(e) => onRootLayout(e.nativeEvent.layout.height)}>
      {/* Carte plein écran (fond) */}
      <View style={StyleSheet.absoluteFill}>
        <VenueMap ref={mapRef} points={points} user={coords} onSelectVenue={(id) => select(id)} onBoundsChange={setBbox} />
      </View>

      <Pressable style={[styles.clubChip, { top: insets.top + Spacing.two }]} onPress={goToClub} hitSlop={6}>
        <Ionicons name={homeVenue ? 'home' : 'add-circle-outline'} size={16} color={Palette.onyx} />
        <ThemedText type="smallBold" themeColor="brand" numberOfLines={1} style={styles.clubChipText}>
          {homeVenue ? homeVenue.name : 'Définir mon club'}
        </ThemedText>
      </Pressable>

      {coords ? (
        <Pressable
          style={[styles.locate, { bottom: (dims.peekH || 320) + Spacing.three }]}
          onPress={() => mapRef.current?.flyTo(coords.lat, coords.lng, 15)}
          hitSlop={8}>
          <Ionicons name="locate" size={20} color={Palette.onyx} />
        </Pressable>
      ) : null}

      {/* Bottom-sheet glissable */}
      <Animated.View style={[styles.sheet, { height: dims.sheetH || undefined, transform: [{ translateY }] }]}>
        {/* Bandeau draggable : poignée (+ titre quand pas de lieu sélectionné) */}
        <View style={styles.handle} {...pan.panHandlers}>
          <View style={styles.grabber} />
          {!selected ? (
            <View style={styles.handleTitle}>
              <ThemedText type="subtitle">Où jouer ?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {feed.length ? `${feed.length} lieu${feed.length > 1 ? 'x' : ''} réservable${feed.length > 1 ? 's' : ''} près de toi` : 'Réserve une table près de toi'}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {selected ? (
          <VenueSheet
            embedded
            venueId={selected}
            onClose={() => {
              setSelected(null);
              void slotsQ.refetch();
              snapTo(false);
            }}
          />
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(it) => it.id}
            renderItem={renderCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshing={slotsQ.isFetching}
            onRefresh={() => {
              void slotsQ.refetch();
              void venuesQ.refetch();
            }}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <View style={styles.ctaRow}>
                  <CtaButton icon="flash" label="Créer un défi" primary onPress={() => router.push('/jouer')} />
                  <CtaButton icon="location" label="Tables proches" onPress={() => snapTo(true)} />
                  <CtaButton icon="people" label="Joueurs proches" onPress={() => router.push('/jouer')} />
                </View>
                <View style={styles.filters}>
                  {PLACE_FILTERS.map((f) => {
                    const active = place === f.key;
                    return (
                      <Pressable key={f.key} style={[styles.filterChip, active && styles.filterChipOn]} onPress={() => setPlace(f.key)} hitSlop={4}>
                        <ThemedText type="smallBold" themeColor={active ? 'onBrand' : 'textSecondary'}>
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
                  <ThemedText type="sectionTitle">Autour de toi</ThemedText>
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
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.whitePP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: Palette.onyx,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  // userSelect none (web) : sinon glisser sur le titre sélectionne le texte au lieu de
  // draguer la feuille (le PanResponder ne capte pas le geste).
  handle: { paddingTop: Spacing.two, paddingHorizontal: Spacing.four, gap: Spacing.two, userSelect: 'none' },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Palette.border },
  handleTitle: { paddingBottom: Spacing.two },

  listHeader: { gap: Spacing.three, marginBottom: Spacing.one },
  ctaRow: { flexDirection: 'row', gap: Spacing.two },
  cta: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  ctaPrimary: { backgroundColor: Palette.lime },
  ctaLabel: { textAlign: 'center' },

  filters: { flexDirection: 'row', gap: Spacing.two },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Palette.white },
  filterChipOn: { backgroundColor: Palette.ink2 },

  listContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.five, gap: Spacing.three },
  empty: { alignItems: 'center', paddingVertical: Spacing.six, gap: Spacing.two },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 280 },
  discover: { marginTop: Spacing.four, gap: Spacing.three },

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
