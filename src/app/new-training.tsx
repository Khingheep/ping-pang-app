import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
  uploadSessionPhoto,
} from '@/lib/training/sessions';
import { fetchVenues, type Venue } from '@/lib/venues/venues';

/** Identifiant de fichier photo (Date.now()+random ok côté app). */
function photoKey(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

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
  const [note, setNote] = useState('');
  const [isSolo, setIsSolo] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchVenues().then(setVenues);
  }, []);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo', 'Autorise l’accès aux photos pour illustrer ta séance.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri);
  }

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
      let photoUrl: string | null = null;
      if (photo) {
        try {
          photoUrl = await uploadSessionPhoto(id, photo, photoKey());
        } catch {
          /* photo optionnelle : on enregistre la séance même si l'upload échoue */
        }
      }
      await addTrainingSession({
        playerId: id,
        durationMin: duration,
        strokes,
        partnerLevel: isSolo ? null : partner,
        venueId: venue?.id ?? null,
        feeling,
        note: note.trim() || null,
        photoUrl,
        isSolo,
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

          <Pressable style={styles.soloRow} onPress={() => setIsSolo((v) => !v)}>
            <ThemedText type="cardTitle">Session seul</ThemedText>
            <View style={[styles.checkbox, isSolo && styles.checkboxOn]}>
              {isSolo ? <Ionicons name="checkmark" size={16} color={Palette.whitePP} /> : null}
            </View>
          </Pressable>

          {!isSolo ? (
            <>
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
            </>
          ) : null}

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

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            TES SENSATIONS
          </ThemedText>
          <TextInput
            style={styles.note}
            placeholder="Ex : bon contrôle, le revers progresse..."
            placeholderTextColor={Palette.grey}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            PHOTO (OPTIONNEL)
          </ThemedText>
          {photo ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
              <Pressable style={styles.photoRemove} onPress={() => setPhoto(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={26} color={Palette.whitePP} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.photoAdd} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={22} color={Palette.evergreen} />
              <ThemedText type="smallBold" themeColor="brand">
                Ajouter une photo
              </ThemedText>
            </Pressable>
          )}
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
  soloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  note: {
    minHeight: 88,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  photoAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 88,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.evergreen,
    borderStyle: 'dashed',
  },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', height: 180, borderRadius: Radius.sm, backgroundColor: Palette.white },
  photoRemove: { position: 'absolute', top: Spacing.two, right: Spacing.two },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
