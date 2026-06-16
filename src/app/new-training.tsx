import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  addTrainingSession,
  FEELINGS,
  PARTNER_LEVELS,
  STROKES,
} from '@/lib/training/sessions';
import { fetchVenues, type Venue } from '@/lib/venues/venues';

const DURATIONS = [
  { min: 30, label: '30 min' },
  { min: 60, label: '1h' },
  { min: 90, label: '1h30' },
  { min: 120, label: '2h+' },
];

export default function NewTrainingScreen() {
  const { session } = useAuth();
  const [strokes, setStrokes] = useState<string[]>([]);
  const [duration, setDuration] = useState(60);
  const [partner, setPartner] = useState<string | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchVenues().then(setVenues);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return venues.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, venues]);

  function toggleStroke(s: string) {
    setStrokes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function save() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setBusy(true);
      await addTrainingSession({
        playerId: id,
        durationMin: duration,
        strokes,
        partnerLevel: partner,
        venueId: venue?.id ?? null,
        feeling,
      });
      Alert.alert('Séance enregistrée 🏓', `${duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? duration % 60 : ''}` : `${duration} min`} de jeu, bien joué !`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Noter un entraînement</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            COUPS TRAVAILLÉS
          </ThemedText>
          <View style={styles.wrap}>
            {STROKES.map((s) => (
              <Chip key={s} label={s} active={strokes.includes(s)} onPress={() => toggleStroke(s)} color={Palette.purple} />
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            DURÉE
          </ThemedText>
          <View style={styles.row}>
            {DURATIONS.map((d) => (
              <Chip key={d.min} label={d.label} active={duration === d.min} onPress={() => setDuration(d.min)} grow />
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            NIVEAU DU PARTENAIRE
          </ThemedText>
          <View style={styles.wrap}>
            {PARTNER_LEVELS.map((p) => (
              <Chip
                key={p}
                label={p}
                active={partner === p}
                onPress={() => setPartner(partner === p ? null : p)}
                color={Palette.lime}
              />
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            LIEU
          </ThemedText>
          {venue ? (
            <View style={styles.selectedVenue}>
              <Ionicons name="location" size={16} color={Palette.evergreen} />
              <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                {venue.name}
              </ThemedText>
              <Pressable onPress={() => setVenue(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={Palette.grey} />
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.search}
                placeholder="Rechercher un lieu (optionnel)"
                placeholderTextColor={Palette.grey}
                value={query}
                onChangeText={setQuery}
              />
              {matches.map((v) => (
                <Pressable
                  key={v.id}
                  style={styles.match}
                  onPress={() => {
                    setVenue(v);
                    setQuery('');
                  }}>
                  <Ionicons name={v.indoor ? 'home' : 'sunny'} size={16} color={Palette.grey} />
                  <ThemedText type="default" numberOfLines={1}>
                    {v.name}
                  </ThemedText>
                </Pressable>
              ))}
            </>
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            FEELING SUR LA SÉANCE
          </ThemedText>
          <View style={styles.row}>
            {FEELINGS.map((f) => (
              <Chip key={f} label={f} active={feeling === f} onPress={() => setFeeling(feeling === f ? null : f)} grow />
            ))}
          </View>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Enregistrer la séance
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  grow,
  color = Palette.evergreen,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  grow?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        grow && { flex: 1 },
        active ? { backgroundColor: color, borderColor: color } : styles.chipIdle,
      ]}>
      <ThemedText type="smallBold" themeColor={active && color === Palette.evergreen ? 'onBrand' : 'text'}>
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
  row: { flexDirection: 'row', gap: Spacing.two },
  wrap: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  search: {
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.border,
  },
  selectedVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
