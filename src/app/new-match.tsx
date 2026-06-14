import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { proposeMatch } from '@/lib/matches/confirm';

const FEELINGS = ['💪', '🔥', '😅', '😐', '😩'];
const BEST_OF = [3, 5, 7];

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(0, value - 1))}>
        <Ionicons name="remove" size={20} color={Palette.onyx} />
      </Pressable>
      <ThemedText type="metric" style={styles.stepVal}>
        {value}
      </ThemedText>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(4, value + 1))}>
        <Ionicons name="add" size={20} color={Palette.onyx} />
      </Pressable>
    </View>
  );
}

export default function NewMatchScreen() {
  const { opponentId, opponentName } = useLocalSearchParams<{ opponentId?: string; opponentName?: string }>();
  const [mySets, setMySets] = useState(0);
  const [oppSets, setOppSets] = useState(0);
  const [bestOf, setBestOf] = useState(5);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!opponentId) {
      Alert.alert('Adversaire manquant', 'Reviens en arrière et choisis un joueur à défier.');
      return;
    }
    if (mySets === oppSets) {
      Alert.alert('Score incomplet', 'Il faut un vainqueur (pas d’égalité de sets).');
      return;
    }
    try {
      setBusy(true);
      const r = await proposeMatch({ opponentId, mySets, oppSets, bestOf, feeling });
      const sign = r.preview_delta > 0 ? '+' : '';
      Alert.alert(
        'Match envoyé 📨',
        `En attente de la confirmation de ${opponentName ?? 'ton adversaire'}.\n` +
          `Une fois validé : ${sign}${r.preview_delta} ELO (estimation).`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
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
          <ThemedText type="cardTitle">Saisir un match</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {opponentName ? (
            <View style={styles.opp}>
              <Avatar name={opponentName} size={56} />
              <View>
                <ThemedText type="small" themeColor="textSecondary">
                  Adversaire
                </ThemedText>
                <ThemedText type="subtitle">{opponentName}</ThemedText>
              </View>
            </View>
          ) : null}

          <View style={styles.scoreRow}>
            <View style={styles.scoreCol}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                MOI
              </ThemedText>
              <Stepper value={mySets} onChange={setMySets} />
            </View>
            <ThemedText type="subtitle" themeColor="textMuted">
              —
            </ThemedText>
            <View style={styles.scoreCol}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {opponentName ?? 'ADVERSAIRE'}
              </ThemedText>
              <Stepper value={oppSets} onChange={setOppSets} />
            </View>
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Format
          </ThemedText>
          <View style={styles.pillRow}>
            {BEST_OF.map((b) => (
              <Pressable
                key={b}
                onPress={() => setBestOf(b)}
                style={[styles.pill, bestOf === b ? styles.pillActive : styles.pillIdle]}>
                <ThemedText type="smallBold" themeColor={bestOf === b ? 'onBrand' : 'text'}>
                  Bo{b}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Feeling
          </ThemedText>
          <View style={styles.pillRow}>
            {FEELINGS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFeeling(f)}
                style={[styles.feeling, feeling === f && styles.feelingActive]}>
                <ThemedText type="subtitle">{f}</ThemedText>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Envoyer pour confirmation
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.two },
  opp: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.four },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  scoreCol: { alignItems: 'center', gap: Spacing.two, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepVal: { fontSize: 44, lineHeight: 48, minWidth: 48, textAlign: 'center' },
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  pillRow: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.sm, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.evergreen },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  feeling: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelingActive: { borderColor: Palette.evergreen, borderWidth: 2, backgroundColor: Palette.lime },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
