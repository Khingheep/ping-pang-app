import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SetScoreEntry, type SetInput } from '@/components/set-score-entry';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { proposeMatch } from '@/lib/matches/confirm';
import { countSets, formatSetScores, validateMatch, type SetScore } from '@/lib/matches/sets';
import { notify } from '@/lib/ui/alert';

const FEELINGS = ['💪', '🔥', '😅', '😐', '😩'];
const BEST_OF = [3, 5, 7];

/** Lignes de manches initiales pour un format (Bo5 → 3 manches pré-affichées). */
function initialSets(bestOf: number): SetInput[] {
  return Array.from({ length: Math.ceil(bestOf / 2) }, () => ({ a: '', b: '' }));
}

/** Convertit la saisie (chaînes) en manches numériques complètes. */
function numericSets(sets: SetInput[]): SetScore[] {
  return sets
    .map((s) => ({ a: Number.parseInt(s.a, 10), b: Number.parseInt(s.b, 10) }))
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
}

export default function NewMatchScreen() {
  const { opponentId, opponentName } = useLocalSearchParams<{ opponentId?: string; opponentName?: string }>();
  const [sets, setSets] = useState<SetInput[]>(() => initialSets(5));
  const [bestOf, setBestOf] = useState(5);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = countSets(numericSets(sets));
  const mySets = counts.a;
  const oppSets = counts.b;

  async function submit() {
    if (!opponentId) {
      notify('Adversaire manquant', 'Reviens en arrière et choisis un joueur à défier.');
      return;
    }
    const valid = validateMatch(numericSets(sets), bestOf);
    if (!valid.ok) {
      notify('Score invalide', valid.error ?? 'Vérifie les manches.');
      return;
    }
    try {
      setBusy(true);
      const setScores = formatSetScores(numericSets(sets));
      const r = await proposeMatch({ opponentId, mySets, oppSets, bestOf, feeling, setScores: setScores || null });
      const sign = r.preview_delta > 0 ? '+' : '';
      notify(
        'Match envoyé 📨',
        `En attente de la confirmation de ${opponentName ?? 'ton adversaire'}.\n` +
          `Une fois validé : ${sign}${r.preview_delta} ELO (estimation).`,
      );
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

          {/* Récap manches gagnées */}
          <View style={styles.scoreRow}>
            <View style={styles.scoreCol}>
              <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
                MOI
              </ThemedText>
              <ThemedText type="metric" themeColor={mySets > oppSets ? 'brand' : 'textMuted'} style={styles.stepVal}>
                {mySets}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" themeColor="textMuted">
              —
            </ThemedText>
            <View style={styles.scoreCol}>
              <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
                {(opponentName ?? 'ADVERSAIRE').toUpperCase()}
              </ThemedText>
              <ThemedText type="metric" themeColor={oppSets > mySets ? 'brand' : 'textMuted'} style={styles.stepVal}>
                {oppSets}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Format
          </ThemedText>
          <View style={styles.pillRow}>
            {BEST_OF.map((b) => (
              <Pressable
                key={b}
                onPress={() => {
                  setBestOf(b);
                  setSets(initialSets(b));
                }}
                style={[styles.pill, bestOf === b ? styles.pillActive : styles.pillIdle]}>
                <ThemedText type="smallBold" themeColor={bestOf === b ? 'onBrand' : 'text'}>
                  Bo{b}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Détail des manches
          </ThemedText>
          <SetScoreEntry
            value={sets}
            onChange={setSets}
            bestOf={bestOf}
            meLabel="Moi"
            oppLabel={opponentName ?? 'Adv.'}
          />

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
