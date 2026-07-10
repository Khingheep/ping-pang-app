import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { createSlot, type SlotFormat } from '@/lib/slots/slots';
import { notify } from '@/lib/ui/alert';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8h → 22h
const DURATIONS = [
  { min: 60, label: '1h' },
  { min: 90, label: '1h30' },
  { min: 120, label: '2h' },
];
const FORMATS: { k: SlotFormat; label: string }[] = [
  { k: 'ntt', label: 'NTT' },
  { k: '3sets', label: '3 sets gagnants' },
  { k: '2sets', label: '2 sets gagnants' },
];

function dayLabel(offset: number): string {
  if (offset === 0) return "Aujourd'hui";
  if (offset === 1) return 'Demain';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function NewSlotScreen() {
  const { venueId, venueName } = useLocalSearchParams<{ venueId?: string; venueName?: string }>();
  const { session } = useAuth();
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(19);
  const [durationMin, setDuration] = useState(60);
  const [format, setFormat] = useState<SlotFormat>('3sets');
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => i), []);

  async function publish() {
    const me = session?.user?.id;
    if (!me || !venueId) {
      notify('Lieu manquant', 'Reviens en arrière et choisis un lieu.');
      return;
    }
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    start.setHours(hour, 0, 0, 0);
    if (start.getTime() < Date.now()) {
      notify('Créneau passé', 'Choisis un horaire à venir.');
      return;
    }
    const end = new Date(start.getTime() + durationMin * 60000);
    try {
      setBusy(true);
      await createSlot({
        venueId,
        hostId: me,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        format,
        levelMin: null, // « niveau recherché » retiré → on notifie tous les joueurs de la zone
        levelMax: null,
      });
      notify('Créneau publié 🏓', 'Les joueurs de la zone ont été notifiés.');
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Proposer un créneau</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {venueName ? (
            <ThemedText type="default" themeColor="textSecondary">
              {venueName} · visible par les joueurs de la zone
            </ThemedText>
          ) : null}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            JOUR
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {days.map((o) => (
              <Pill key={o} active={dayOffset === o} label={dayLabel(o)} onPress={() => setDayOffset(o)} />
            ))}
          </ScrollView>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            DÉBUT
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {HOURS.map((h) => (
              <Pill key={h} active={hour === h} label={`${h}h00`} onPress={() => setHour(h)} />
            ))}
          </ScrollView>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            DURÉE
          </ThemedText>
          <View style={styles.row}>
            {DURATIONS.map((d) => (
              <Pill key={d.min} active={durationMin === d.min} label={d.label} onPress={() => setDuration(d.min)} grow />
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            FORMAT
          </ThemedText>
          <View style={styles.rowWrap}>
            {FORMATS.map((f) => (
              <Pill key={f.k} active={format === f.k} label={f.label} onPress={() => setFormat(f.k)} />
            ))}
          </View>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={publish}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Publier le créneau
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function Pill({
  active,
  label,
  onPress,
  grow,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, grow && { flex: 1 }, active ? styles.pillActive : styles.pillIdle]}>
      <ThemedText type="smallBold" themeColor={active ? 'onBrand' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  lbl: { marginTop: Spacing.four, marginBottom: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.four },
  rowWrap: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: Palette.ink2 },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
