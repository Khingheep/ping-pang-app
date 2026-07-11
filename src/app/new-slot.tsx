import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePicker } from '@/components/date-picker';
import { StepSlider } from '@/components/step-slider';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { createSlot } from '@/lib/slots/slots';
import { formatDuration } from '@/lib/training/sessions';
import { notify } from '@/lib/ui/alert';

// Heure de début : slider fluide 8h → 22h, pas de 15 min (minutes depuis minuit).
const START_MIN = 8 * 60;
const START_MAX = 22 * 60;
const START_STEP = 15;

// Durée : même échelle que l'entraînement (15 min → 3h, pas de 15 min).
const DUR_MIN = 15;
const DUR_MAX = 180;
const DUR_STEP = 15;

/** minutes depuis minuit → "19h00" / "19h30". */
function formatTime(min: number): string {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export default function NewSlotScreen() {
  const { venueId, venueName } = useLocalSearchParams<{ venueId?: string; venueName?: string }>();
  const { session } = useAuth();
  const [selected, setSelected] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [startMin, setStartMin] = useState(19 * 60); // 19h par défaut
  const [durationMin, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);

  async function publish() {
    const me = session?.user?.id;
    if (!me || !venueId) {
      notify('Lieu manquant', 'Reviens en arrière et choisis un lieu.');
      return;
    }
    const start = new Date(selected);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
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
        format: '3sets', // format retiré de l'UI → défaut ; les joueurs s'accordent sur place
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
          <DatePicker value={selected} onChange={setSelected} />

          <View style={styles.sliderHead}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              DÉBUT
            </ThemedText>
            <ThemedText type="cardTitle">{formatTime(startMin)}</ThemedText>
          </View>
          <StepSlider value={startMin} min={START_MIN} max={START_MAX} step={START_STEP} onChange={setStartMin} />
          <View style={styles.ends}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(START_MIN)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(START_MAX)}
            </ThemedText>
          </View>

          <View style={styles.sliderHead}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              DURÉE
            </ThemedText>
            <ThemedText type="cardTitle">{formatDuration(durationMin)}</ThemedText>
          </View>
          <StepSlider value={durationMin} min={DUR_MIN} max={DUR_MAX} step={DUR_STEP} onChange={setDuration} />
          <View style={styles.ends}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDuration(DUR_MIN)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDuration(DUR_MAX)}
            </ThemedText>
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
  sliderHead: {
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
