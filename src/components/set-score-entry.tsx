/**
 * Saisie du score manche par manche (Bo3/Bo5/Bo7…).
 * Contrôlé : `value` = liste de manches {a,b} (chaînes pour gérer la saisie vide),
 * `onChange` renvoie la nouvelle liste. Le parent calcule les manches gagnées via `countSets`.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { isValidSet } from '@/lib/matches/sets';

export type SetInput = { a: string; b: string };

/** Une manche est marquée invalide seulement si les 2 scores sont saisis mais non réglementaires. */
function rowInvalid(s: SetInput): boolean {
  if (s.a === '' || s.b === '') return false;
  return !isValidSet({ a: Number.parseInt(s.a, 10), b: Number.parseInt(s.b, 10) });
}

export function SetScoreEntry({
  value,
  onChange,
  bestOf,
  meLabel = 'Moi',
  oppLabel = 'Adv.',
}: {
  value: SetInput[];
  onChange: (next: SetInput[]) => void;
  bestOf: number;
  meLabel?: string;
  oppLabel?: string;
}) {
  const setAt = (i: number, patch: Partial<SetInput>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const add = () => onChange([...value, { a: '', b: '' }]);
  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onlyInt = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 2);

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <View style={styles.setLbl} />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.colLbl} numberOfLines={1}>
          {meLabel}
        </ThemedText>
        <View style={{ width: 12 }} />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.colLbl} numberOfLines={1}>
          {oppLabel}
        </ThemedText>
        <View style={styles.del} />
      </View>

      {value.map((s, i) => {
        const bad = rowInvalid(s);
        return (
          <View key={i} style={styles.row}>
            <ThemedText type="smallBold" themeColor={bad ? 'danger' : 'textSecondary'} style={styles.setLbl}>
              M{i + 1}
            </ThemedText>
            <TextInput
              style={[styles.cell, bad && styles.cellBad]}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={Palette.grey}
              value={s.a}
              onChangeText={(t) => setAt(i, { a: onlyInt(t) })}
              maxLength={2}
            />
            <ThemedText type="subtitle" themeColor="textMuted">
              -
            </ThemedText>
            <TextInput
              style={[styles.cell, bad && styles.cellBad]}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={Palette.grey}
              value={s.b}
              onChangeText={(t) => setAt(i, { b: onlyInt(t) })}
              maxLength={2}
            />
            <Pressable style={styles.del} onPress={() => removeAt(i)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={Palette.border} />
            </Pressable>
          </View>
        );
      })}

      {value.length < bestOf ? (
        <Pressable style={styles.addBtn} onPress={add}>
          <Ionicons name="add" size={18} color={Palette.evergreen} />
          <ThemedText type="smallBold" themeColor="brand">
            Ajouter une manche
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const CELL = 56;
const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  colLbl: { width: CELL, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  setLbl: { width: 28 },
  cell: {
    width: CELL,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    textAlign: 'center',
    color: Palette.onyx,
    fontFamily: 'OpenSauceTwo-Bold',
    fontSize: 20,
  },
  cellBad: { borderColor: Palette.redInk, borderWidth: 1.5, backgroundColor: Palette.red },
  del: { width: 28, alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.evergreen,
    borderStyle: 'dashed',
    marginTop: Spacing.one,
  },
});
