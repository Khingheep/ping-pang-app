import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  FORMAT_LABEL,
  fetchSlotsForVenue,
  joinSlot,
  leaveSlot,
  levelLabel,
  slotTimeLabel,
  type Slot,
} from '@/lib/slots/slots';
import { fetchVenue, type Venue } from '@/lib/venues/venues';

export default function VenueScreen() {
  const { id, name, address, indoor } = useLocalSearchParams<{
    id?: string;
    name?: string;
    address?: string;
    indoor?: string;
  }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [slots, setSlots] = useState<Slot[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetchSlotsForVenue(id).then(setSlots);
    fetchVenue(id).then(setVenue);
  }, [id]);
  useFocusEffect(load);

  async function toggleJoin(s: Slot) {
    if (!myId) return;
    const joined = s.participants.some((p) => p.id === myId);
    try {
      setBusy(s.id);
      if (joined) await leaveSlot(s.id, myId);
      else await joinSlot(s.id, myId);
      load();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(null);
    }
  }

  const vName = venue?.name ?? name ?? 'Lieu';
  const vAddress = venue?.address ?? address ?? null;
  const isIndoor = venue ? !!venue.indoor : indoor === 'true';

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Lieu</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title">{vName}</ThemedText>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: isIndoor ? Palette.blue : Palette.lime }]}>
              <ThemedText type="smallBold" themeColor="text">
                {isIndoor ? 'Intérieur' : 'Extérieur'}
              </ThemedText>
            </View>
            {vAddress ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {vAddress}
              </ThemedText>
            ) : null}
          </View>

          <Pressable
            style={styles.cta}
            onPress={() => router.push({ pathname: '/new-slot', params: { venueId: id, venueName: vName } })}>
            <Ionicons name="add-circle-outline" size={20} color={Palette.whitePP} />
            <ThemedText type="cardTitle" themeColor="onBrand">
              Proposer un créneau ici
            </ThemedText>
          </Pressable>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Créneaux proposés{slots.length ? ` (${slots.length})` : ''}
          </ThemedText>

          {slots.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucun créneau pour l&apos;instant. Sois le premier à en proposer un ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {slots.map((s) => {
                const mine = s.hostId === myId;
                const joined = s.participants.some((p) => p.id === myId);
                return (
                  <View key={s.id} style={styles.slot}>
                    <View style={styles.slotTop}>
                      <Avatar name={s.hostName} size={40} color={Palette.purple} />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="cardTitle">{s.hostName}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {slotTimeLabel(s.startsAt, s.endsAt)}
                        </ThemedText>
                      </View>
                      {mine ? (
                        <View style={styles.hostTag}>
                          <ThemedText type="smallBold" themeColor="brand">
                            Ton créneau
                          </ThemedText>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.joinBtn, joined && styles.joinedBtn]}
                          disabled={busy === s.id}
                          onPress={() => toggleJoin(s)}>
                          {busy === s.id ? (
                            <ActivityIndicator color={joined ? Palette.evergreen : Palette.whitePP} size="small" />
                          ) : (
                            <ThemedText type="smallBold" themeColor={joined ? 'brand' : 'onBrand'}>
                              {joined ? 'Inscrit ✓' : 'Rejoindre'}
                            </ThemedText>
                          )}
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.chips}>
                      <View style={styles.chip}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {FORMAT_LABEL[s.format]}
                        </ThemedText>
                      </View>
                      <View style={styles.chip}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {levelLabel(s.levelMin, s.levelMax)}
                        </ThemedText>
                      </View>
                      <View style={styles.chip}>
                        <Ionicons name="people-outline" size={13} color={Palette.grey} />
                        <ThemedText type="small" themeColor="textSecondary">
                          {' '}
                          {s.participants.length}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  badge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
  cta: {
    marginTop: Spacing.two,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  section: { marginTop: Spacing.three },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  slot: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  slotTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  hostTag: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  joinBtn: {
    minWidth: 96,
    height: 40,
    borderRadius: Radius.xs,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  joinedBtn: { backgroundColor: Palette.lime },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
});
