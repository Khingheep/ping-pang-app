/**
 * Panneau d'une table/lieu sélectionné sur la carte : nom + adresse, ses créneaux ouverts
 * (rejoindre / quitter), un bouton « Proposer un créneau ici » et un lien vers la page complète.
 *
 * Ancré en bas SANS Modal ni voile : la carte reste visible et déplaçable derrière (on ne capture
 * que les touches dans la zone du panneau).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  FORMAT_LABEL,
  fetchSlotsForVenue,
  joinSlot,
  leaveSlot,
  levelLabel,
  type Slot,
  slotTimeLabel,
} from '@/lib/slots/slots';
import { notify } from '@/lib/ui/alert';
import { fetchVenue, type Venue } from '@/lib/venues/venues';

export function VenueSheet({
  venueId,
  onClose,
  embedded = false,
}: {
  venueId: string | null;
  onClose: () => void;
  /** true = rendu à l'intérieur du panneau existant (carte), sans overlay ni ombre. */
  embedded?: boolean;
}) {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!venueId) return;
    fetchSlotsForVenue(venueId).then(setSlots);
  }, [venueId]);

  useEffect(() => {
    if (!venueId) {
      setVenue(null);
      setSlots([]);
      return;
    }
    fetchVenue(venueId).then(setVenue);
    load();
  }, [venueId, load]);

  async function toggle(s: Slot) {
    if (!myId || s.hostId === myId) return;
    const joined = s.participants.some((p) => p.id === myId);
    try {
      setBusy(s.id);
      if (joined) await leaveSlot(s.id, myId);
      else await joinSlot(s.id, myId);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(null);
    }
  }

  if (!venueId) return null;

  const name = venue?.name ?? 'Lieu';
  const isIndoor = !!venue?.indoor;

  return (
    <View style={embedded ? styles.embedded : styles.sheet}>
      {embedded ? null : <View style={styles.grip} />}
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: isIndoor ? Palette.blue : Palette.lime }]}>
          <Ionicons name={isIndoor ? 'home' : 'sunny'} size={16} color={Palette.onyx} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="cardTitle" numberOfLines={1}>
            {name}
          </ThemedText>
          {venue?.address ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {venue.address}
            </ThemedText>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={Palette.onyx} />
        </Pressable>
      </View>

      <Pressable
        style={styles.cta}
        onPress={() => {
          onClose();
          router.push({ pathname: '/new-slot', params: { venueId: venueId ?? '', venueName: name } });
        }}>
        <Ionicons name="add-circle-outline" size={20} color={Palette.whitePP} />
        <ThemedText type="cardTitle" themeColor="onBrand">
          Proposer un créneau ici
        </ThemedText>
      </Pressable>

      <View style={styles.sectionRow}>
        <ThemedText type="sectionTitle" themeColor="textSecondary">
          Créneaux ouverts{slots.length ? ` (${slots.length})` : ''}
        </ThemedText>
        <Pressable
          onPress={() => {
            onClose();
            router.push({ pathname: '/venue', params: { id: venueId ?? '' } });
          }}
          hitSlop={8}>
          <ThemedText type="smallBold" themeColor="brand">
            Voir le lieu →
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={embedded ? styles.listFill : styles.list}
        contentContainerStyle={{ gap: Spacing.two, paddingBottom: embedded ? BottomTabInset + Spacing.three : 0 }}
        showsVerticalScrollIndicator={false}>
        {slots.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="default" themeColor="textSecondary">
              Aucun créneau ici. Sois le premier à en proposer un ! 🏓
            </ThemedText>
          </View>
        ) : (
          slots.map((s) => {
            const mine = s.hostId === myId;
            const joined = s.participants.some((p) => p.id === myId);
            return (
              <View key={s.id} style={styles.slot}>
                <Avatar name={s.hostName} uri={s.hostAvatar} size={40} color={Palette.purple} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="cardTitle" numberOfLines={1}>
                    {s.hostName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {slotTimeLabel(s.startsAt, s.endsAt)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {FORMAT_LABEL[s.format]} · {levelLabel(s.levelMin, s.levelMax)} · {s.participants.length} joueur
                    {s.participants.length > 1 ? 's' : ''}
                  </ThemedText>
                </View>
                {mine ? (
                  <View style={styles.tag}>
                    <ThemedText type="smallBold" themeColor="brand">
                      Toi
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.slotActions}>
                    <Pressable
                      style={styles.msgBtn}
                      hitSlop={6}
                      onPress={() => router.push({ pathname: '/chat', params: { id: s.hostId, name: s.hostName } })}>
                      <Ionicons name="chatbubble-outline" size={18} color={Palette.onyx} />
                    </Pressable>
                    <Pressable
                      style={[styles.joinBtn, joined ? styles.joined : styles.join, busy === s.id && { opacity: 0.5 }]}
                      disabled={busy === s.id}
                      onPress={() => toggle(s)}>
                      {busy === s.id ? (
                        <ActivityIndicator size="small" color={joined ? Palette.evergreen : Palette.whitePP} />
                      ) : (
                        <ThemedText type="smallBold" themeColor={joined ? 'brand' : 'onBrand'}>
                          {joined ? 'Rejoint ✓' : 'Rejoindre'}
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    backgroundColor: Palette.whitePP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    // ombre sur le bord haut → le panneau se détache de la carte (sans voile)
    shadowColor: Palette.onyx,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  embedded: { flex: 1, paddingHorizontal: Spacing.four },
  listFill: { flex: 1 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.border, marginTop: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  badge: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  cta: {
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.four, marginBottom: Spacing.two },
  list: { maxHeight: 300 },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  tag: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  slotActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  msgBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  joinBtn: { minWidth: 92, height: 38, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  join: { backgroundColor: Palette.onyx },
  joined: { backgroundColor: Palette.lime },
});
