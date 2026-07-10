/**
 * Bottom-sheet de saisie d'un score depuis le chat. Réutilise SetScoreEntry + la validation
 * officielle (validateMatch). `onSubmit` renvoie les manches + le format ; le parent appelle
 * sendScoreMessage (qui crée le match dual-confirm et poste la carte).
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SetScoreEntry, type SetInput } from '@/components/set-score-entry';
import { SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { countSets, validateMatch, type SetScore } from '@/lib/matches/sets';
import { notify } from '@/lib/ui/alert';

const BEST_OF = [3, 5, 7];

function initialSets(bestOf: number): SetInput[] {
  return Array.from({ length: Math.ceil(bestOf / 2) }, () => ({ a: '', b: '' }));
}

function numericSets(sets: SetInput[]): SetScore[] {
  return sets
    .map((s) => ({ a: Number.parseInt(s.a, 10), b: Number.parseInt(s.b, 10) }))
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
}

export function ScoreEntrySheet({
  visible,
  opponentName,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  opponentName: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (sets: SetScore[], bestOf: number) => void;
}) {
  const [bestOf, setBestOf] = useState(5);
  const [sets, setSets] = useState<SetInput[]>(() => initialSets(5));

  const counts = countSets(numericSets(sets));

  function submit() {
    const numeric = numericSets(sets);
    const valid = validateMatch(numeric, bestOf);
    if (!valid.ok) {
      notify('Score invalide', valid.error ?? 'Vérifie les manches.');
      return;
    }
    onSubmit(numeric, bestOf);
  }

  return (
    <SwipeSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={Palette.onyx} />
        </Pressable>
        <ThemedText type="cardTitle">Saisir le score</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCol}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              MOI
            </ThemedText>
            <ThemedText type="metric" themeColor={counts.a > counts.b ? 'brand' : 'textMuted'} style={styles.big}>
              {counts.a}
            </ThemedText>
          </View>
          <ThemedText type="subtitle" themeColor="textMuted">
            -
          </ThemedText>
          <View style={styles.scoreCol}>
            <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
              {opponentName.toUpperCase()}
            </ThemedText>
            <ThemedText type="metric" themeColor={counts.b > counts.a ? 'brand' : 'textMuted'} style={styles.big}>
              {counts.b}
            </ThemedText>
          </View>
        </View>

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

        <SetScoreEntry value={sets} onChange={setSets} bestOf={bestOf} meLabel="Moi" oppLabel={opponentName} />
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
    </SwipeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '88%' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.three },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  scoreCol: { alignItems: 'center', gap: Spacing.one, flex: 1 },
  big: { fontSize: 40, lineHeight: 44, minWidth: 44, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.sm, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.ink2 },
  pillIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  submit: {
    margin: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
