/**
 * Onglet « Parties » (ex-Carte) — « où / avec qui jouer ».
 *
 * Recentré business : le club d'abord, puis les CRÉNEAUX ouverts à rejoindre (le cœur :
 * c'est ce qui génère des vraies parties + alimente le feed), puis des lieux CURATÉS
 * (le club + spots ajoutés à la main), pas le dump de 267 tables OSM.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { VenueMap } from '@/components/venue-map';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  fetchUpcomingSlots,
  FORMAT_LABEL,
  joinSlot,
  leaveSlot,
  levelLabel,
  slotTimeLabel,
  type Slot,
} from '@/lib/slots/slots';
import { fetchEvents, fetchFeaturedVenues, type EventPP, type Venue } from '@/lib/venues/venues';

const MAP_HEIGHT = 200;

function eventDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function PartiesScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [venues, setVenues] = useState<Venue[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [events, setEvents] = useState<EventPP[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchFeaturedVenues().then(setVenues);
    fetchUpcomingSlots(30).then(setSlots);
    fetchEvents().then(setEvents);
  }, []);

  useFocusEffect(load);

  const club = venues.find((v) => /ping\s*pang\s*paris/i.test(v.name)) ?? null;
  const otherVenues = venues.filter((v) => v.id !== club?.id);

  const openVenue = (v: Venue) =>
    router.push({ pathname: '/venue', params: { id: v.id, name: v.name, address: v.address ?? '', indoor: String(!!v.indoor) } });

  async function toggleSlot(s: Slot) {
    if (!myId || s.hostId === myId) return;
    const joined = s.participants.some((p) => p.id === myId);
    try {
      setBusyId(s.id);
      if (joined) await leaveSlot(s.id, myId);
      else await joinSlot(s.id, myId);
      load();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ThemedText type="title">Parties</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
              Trouve une partie à rejoindre près de toi.
            </ThemedText>
          </View>

          {/* Le club */}
          {club ? (
            <Pressable style={styles.clubCard} onPress={() => openVenue(club)}>
              <View style={styles.clubIcon}>
                <Ionicons name="home" size={22} color={Palette.evergreen} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" style={{ color: Palette.lime }}>
                  LE CLUB
                </ThemedText>
                <ThemedText type="cardTitle" themeColor="onBrand" numberOfLines={1}>
                  {club.name}
                </ThemedText>
                {club.address ? (
                  <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.8 }} numberOfLines={1}>
                    {club.address}
                  </ThemedText>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Palette.whitePP} />
            </Pressable>
          ) : null}

          {/* Carte des lieux curatés */}
          {venues.length ? (
            <View style={styles.mapWrap}>
              <VenueMap venues={venues} />
            </View>
          ) : null}

          {/* Créer un créneau */}
          <Pressable style={styles.createBtn} onPress={() => router.push('/new-slot')}>
            <Ionicons name="add" size={20} color={Palette.whitePP} />
            <ThemedText type="cardTitle" themeColor="onBrand">
              Créer un créneau
            </ThemedText>
          </Pressable>

          {/* Créneaux ouverts = le cœur */}
          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Créneaux ouverts{slots.length ? ` (${slots.length})` : ''}
          </ThemedText>
          {slots.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucune partie ouverte. Crée le premier créneau et invite le club ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {slots.map((s) => {
                const isHost = s.hostId === myId;
                const joined = s.participants.some((p) => p.id === myId);
                return (
                  <View key={s.id} style={styles.slotCard}>
                    <Avatar name={s.hostName} size={44} color={Palette.purple} />
                    <View style={styles.slotMain}>
                      <ThemedText type="cardTitle" numberOfLines={1}>
                        {s.hostName} · {s.venueName}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {slotTimeLabel(s.startsAt, s.endsAt)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {FORMAT_LABEL[s.format]} · {levelLabel(s.levelMin, s.levelMax)} · {s.participants.length} joueur
                        {s.participants.length > 1 ? 's' : ''}
                      </ThemedText>
                    </View>
                    {isHost ? (
                      <View style={[styles.slotTag, { backgroundColor: Palette.lime }]}>
                        <ThemedText type="smallBold" themeColor="brand">
                          Toi
                        </ThemedText>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.slotBtn, joined ? styles.slotBtnJoined : styles.slotBtnJoin, busyId === s.id && { opacity: 0.5 }]}
                        disabled={busyId === s.id}
                        onPress={() => toggleSlot(s)}>
                        <ThemedText type="smallBold" themeColor={joined ? 'brand' : 'onBrand'}>
                          {joined ? 'Rejoint ✓' : 'Rejoindre'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Lieux curatés */}
          {otherVenues.length ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Où jouer
              </ThemedText>
              <View style={styles.list}>
                {otherVenues.map((v) => (
                  <Pressable key={v.id} style={styles.venueCard} onPress={() => openVenue(v)}>
                    <View style={[styles.pin, { backgroundColor: v.indoor ? Palette.blue : Palette.lime }]}>
                      <Ionicons name={v.indoor ? 'home' : 'sunny'} size={18} color={Palette.onyx} />
                    </View>
                    <View style={styles.slotMain}>
                      <ThemedText type="cardTitle" numberOfLines={1}>
                        {v.name}
                      </ThemedText>
                      {v.address ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {v.address}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Palette.grey} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {/* Événements du club */}
          {events.length ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Événements à venir
              </ThemedText>
              <View style={styles.list}>
                {events.map((e) => (
                  <View key={e.id} style={styles.eventCard}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="cardTitle">{e.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {eventDate(e.starts_at)}
                        {e.venue ? ` · ${e.venue.name}` : ''}
                      </ThemedText>
                    </View>
                    {e.spots_left != null ? (
                      <View style={styles.slotTag}>
                        <ThemedText type="smallBold" themeColor="brand">
                          {e.spots_left} places
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
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
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  header: {},
  sub: { marginTop: Spacing.one, marginBottom: Spacing.three },

  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  clubIcon: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },

  mapWrap: {
    height: MAP_HEIGHT,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.whitePP,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    marginTop: Spacing.three,
  },

  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  empty: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, borderRadius: Radius.sm, padding: Spacing.four },
  list: { gap: Spacing.two },

  slotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  slotMain: { flex: 1, gap: Spacing.half },
  slotBtn: { borderRadius: Radius.xs, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  slotBtnJoin: { backgroundColor: Palette.evergreen },
  slotBtnJoined: { backgroundColor: Palette.lime },
  slotTag: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },

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
});
