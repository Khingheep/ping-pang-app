/**
 * Carte de lieu (feed Parties, façon TheFork) : « photo » = vignette carte statique centrée sur le
 * lieu (mosaïque de tuiles CARTO, cf. static-map.ts) avec un pin, surmontée des badges
 * (intérieur/extérieur, distance) ; puis nom, adresse et les créneaux ouverts en pastilles inline.
 *
 * Sans coordonnées (rare) → repli sur une bannière dégradée. Un tap (carte ou pastille) ouvre la
 * bottom-sheet du lieu pour rejoindre / proposer un créneau.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { formatDistance } from '@/lib/location/distance';
import { tileMosaic } from '@/lib/location/static-map';
import type { Slot } from '@/lib/slots/slots';

type Props = {
  name: string;
  address?: string | null;
  indoor?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number | null;
  slots?: Slot[];
  players?: number;
  onPress: () => void;
};

const BANNER_W = Dimensions.get('window').width - Spacing.four * 2; // cartes pleine largeur (padding liste)
const BANNER_H = 132;
const FALLBACK_GRADIENT = [Palette.evergreen, '#2E7D4F'] as const;

/** « Auj. 19h », « Dem. 20h », « sam. 18h ». */
function chipTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  const day =
    d.toDateString() === now.toDateString()
      ? 'Auj.'
      : d.toDateString() === tomorrow.toDateString()
        ? 'Dem.'
        : d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return `${day} ${hm}`;
}

export const VenueCard = memo(function VenueCard({ name, address, indoor, lat, lng, distanceKm, slots, players, onPress }: Props) {
  const isIndoor = !!indoor;
  const hasSlots = !!slots && slots.length > 0;
  const shown = slots?.slice(0, 4) ?? [];
  const extra = (slots?.length ?? 0) - shown.length;
  const hasCoords = lat != null && lng != null;

  const mosaic = useMemo(() => (hasCoords ? tileMosaic(lat!, lng!, BANNER_W, BANNER_H) : null), [hasCoords, lat, lng]);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.banner}>
        {/* « Photo » = vignette carte statique centrée (ou dégradé si pas de coordonnées) */}
        {mosaic ? (
          <View style={[styles.block, { left: mosaic.offsetX, top: mosaic.offsetY, width: mosaic.blockSize, height: mosaic.blockSize }]}>
            {mosaic.tiles.map((t) => (
              <Image
                key={t.uri}
                source={{ uri: t.uri }}
                style={{ position: 'absolute', left: t.left, top: t.top, width: mosaic.tileSize, height: mosaic.tileSize }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
                recyclingKey={t.uri}
              />
            ))}
          </View>
        ) : (
          <LinearGradient colors={FALLBACK_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}

        {/* Voile haut → lisibilité des badges blancs sur la carte */}
        <LinearGradient colors={['rgba(9,44,37,0.45)', 'rgba(9,44,37,0)']} style={styles.scrim} pointerEvents="none" />

        {/* Badges */}
        <View style={styles.bannerTop}>
          <View style={styles.badge}>
            <Ionicons name={isIndoor ? 'home' : 'sunny'} size={13} color={Palette.onyx} />
            <ThemedText type="smallBold">{isIndoor ? 'Intérieur' : 'Extérieur'}</ThemedText>
          </View>
          {distanceKm != null ? (
            <View style={styles.badge}>
              <Ionicons name="navigate" size={12} color={Palette.onyx} />
              <ThemedText type="smallBold">{formatDistance(distanceKm)}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* Pin centré (le lieu est au centre de la mosaïque) */}
        {mosaic ? (
          <View style={styles.pin} pointerEvents="none">
            <Ionicons name="location" size={40} color={Palette.white} style={styles.pinHalo} />
            <Ionicons name="location" size={34} color={Palette.evergreen} style={styles.pinFront} />
          </View>
        ) : null}

        {hasSlots ? (
          <View style={styles.slotsBadge}>
            <View style={styles.dot} />
            <ThemedText type="smallBold" themeColor="brand">
              {slots!.length} créneau{slots!.length > 1 ? 'x' : ''}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Infos lieu */}
      <View style={styles.body}>
        <ThemedText type="cardTitle" numberOfLines={1}>
          {name}
        </ThemedText>
        {address ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.address}>
            {address}
          </ThemedText>
        ) : null}

        {hasSlots ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsRow}>
            {shown.map((s) => (
              <View key={s.id} style={styles.chip}>
                <ThemedText type="smallBold" themeColor="brand">
                  {chipTime(s.startsAt)}
                </ThemedText>
                <View style={styles.chipSep} />
                <Ionicons name="people" size={12} color={Palette.evergreen} />
                <ThemedText type="smallBold" themeColor="brand">
                  {s.participants.length}
                </ThemedText>
              </View>
            ))}
            {extra > 0 ? (
              <View style={[styles.chip, styles.chipMore]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  +{extra}
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.proposeRow}>
            <Ionicons name="add-circle-outline" size={16} color={Palette.evergreen} />
            <ThemedText type="smallBold" themeColor="brand">
              Aucun créneau - propose le premier
            </ThemedText>
          </View>
        )}

        {hasSlots && players ? (
          <ThemedText type="small" themeColor="textMuted" style={styles.players}>
            {players} joueur{players > 1 ? 's' : ''} inscrit{players > 1 ? 's' : ''}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.white,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    shadowColor: Palette.onyx,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  banner: { height: BANNER_H, backgroundColor: Palette.whitePP, overflow: 'hidden', justifyContent: 'space-between', padding: Spacing.three },
  block: { position: 'absolute' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 56 },
  bannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.whitePP,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    shadowColor: Palette.onyx,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // Pin centré : on positionne la pointe (bas de l'icône) au centre de la bannière.
  pin: { position: 'absolute', left: BANNER_W / 2 - 20, top: BANNER_H / 2 - 34, width: 40, height: 40, alignItems: 'center' },
  pinHalo: { position: 'absolute' },
  pinFront: { position: 'absolute', top: 3 },
  slotsBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.evergreen },
  body: { padding: Spacing.three, gap: Spacing.one },
  address: { marginTop: -2 },
  chipsRow: { marginTop: Spacing.two, marginHorizontal: -2 },
  chips: { gap: Spacing.two, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.lime,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  chipMore: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  chipSep: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: Palette.evergreen, opacity: 0.3, marginHorizontal: 2 },
  proposeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  players: { marginTop: Spacing.one },
});
