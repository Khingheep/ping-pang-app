/**
 * Création d'un tournoi (Figma « Créer mon tournoi ») : nombre de joueurs, format,
 * joueurs par poule, matchs de classement. À la création on obtient un code d'invitation
 * et on est redirigé vers le détail du tournoi.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { createTournament, TOURNAMENT_FORMATS, type TournamentFormat } from '@/lib/tournaments/tournaments';

const SIZES = [4, 8, 16, 32];
const FORMATS: TournamentFormat[] = ['bo3', 'bo5', 'bo7', 'wtt', 'champions'];
const PER_POULE = [3, 4, 5];

export default function NewTournamentScreen() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [size, setSize] = useState(8);
  const [format, setFormat] = useState<TournamentFormat>('bo5');
  const [perPoule, setPerPoule] = useState(4);
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    const me = session?.user?.id;
    if (!me) return;
    try {
      setBusy(true);
      const t = await createTournament(me, {
        name: name.trim() || 'Mon tournoi',
        format,
        maxPlayers: size,
        playersPerPoule: perPoule,
        isRanked: ranked,
      });
      router.replace({ pathname: '/tournoi', params: { id: t.id } });
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
            <Ionicons name="close" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Créer mon tournoi</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            NOM DU TOURNOI
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Ex : Tournoi du dimanche"
            placeholderTextColor={Palette.grey}
            value={name}
            onChangeText={setName}
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            NOMBRE DE JOUEURS
          </ThemedText>
          <View style={styles.chipRow}>
            {SIZES.map((s) => (
              <Pressable key={s} onPress={() => setSize(s)} style={[styles.chip, size === s ? styles.chipOn : styles.chipOff]}>
                <ThemedText type="smallBold" themeColor={size === s ? 'onBrand' : 'text'}>
                  {s}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            FORMAT
          </ThemedText>
          <View style={styles.chipWrap}>
            {FORMATS.map((f) => (
              <Pressable key={f} onPress={() => setFormat(f)} style={[styles.chipWide, format === f ? styles.chipOn : styles.chipOff]}>
                <ThemedText type="smallBold" themeColor={format === f ? 'onBrand' : 'text'}>
                  {TOURNAMENT_FORMATS[f].label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            JOUEURS PAR POULE
          </ThemedText>
          <View style={styles.chipRow}>
            {PER_POULE.map((n) => (
              <Pressable key={n} onPress={() => setPerPoule(n)} style={[styles.chipFlex, perPoule === n ? styles.chipOn : styles.chipOff]}>
                <ThemedText type="smallBold" themeColor={perPoule === n ? 'onBrand' : 'text'}>
                  {n} joueurs
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.rankedRow} onPress={() => setRanked((r) => !r)}>
            <View style={styles.rankedText}>
              <ThemedText type="cardTitle">Matchs de classement</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Les résultats comptent dans l’ELO des joueurs.
              </ThemedText>
            </View>
            <View style={[styles.toggle, ranked ? styles.toggleOn : styles.toggleOff]}>
              <View style={[styles.knob, ranked ? styles.knobOn : styles.knobOff]} />
            </View>
          </Pressable>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={create}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Créer le tournoi
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
  input: {
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', gap: Spacing.two },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.xs, alignItems: 'center' },
  chipFlex: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.xs, alignItems: 'center' },
  chipWide: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, borderRadius: Radius.xs, alignItems: 'center' },
  chipOn: { backgroundColor: Palette.evergreen },
  chipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.five,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  rankedText: { flex: 1, gap: Spacing.half },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: Palette.evergreen },
  toggleOff: { backgroundColor: Palette.border },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.white },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
