/**
 * Saisie du score manche par manche (Bo3/Bo5/Bo7…).
 * Contrôlé : `value` = liste de manches {a,b} (chaînes pour gérer la saisie vide),
 * `onChange` renvoie la nouvelle liste. Le parent calcule les manches gagnées via `countSets`.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { autofillOpponent, isValidSet } from '@/lib/matches/sets';

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
  const onlyInt = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 2);

  // Cellules « 11 » remplies automatiquement (hack UX) : clé `${row}:${side}`. On les traque pour
  // pouvoir les retirer si le perdant passe en deuce (≥ 10), sans écraser une saisie manuelle.
  const [auto, setAuto] = useState<Record<string, boolean>>({});

  /**
   * Édite une cellule avec le petit hack UX : si on tape le score du PERDANT (0–9) et que la
   * cellule d'en face est vide (ou déjà auto), l'adversaire passe à 11 tout seul (un joueur ≤ 9 a
   * forcément perdu la manche 11-x). En deuce (≥ 10) ou si on vide la cellule, on retire ce 11 auto.
   */
  const editCell = (i: number, side: 'a' | 'b', raw: string) => {
    const next = onlyInt(raw);
    const opp: 'a' | 'b' = side === 'a' ? 'b' : 'a';
    const cur = value[i];
    const patch: Partial<SetInput> = { [side]: next };
    const nextAuto = { ...auto };
    delete nextAuto[`${i}:${side}`]; // on tape ici → cette cellule n'est plus « auto »

    const decision = autofillOpponent(next, cur[opp], !!auto[`${i}:${opp}`]);
    if (decision === '11') {
      patch[opp] = '11'; // perdant clair → l'adversaire a fait 11
      nextAuto[`${i}:${opp}`] = true;
    } else if (decision === '') {
      patch[opp] = ''; // deuce ou cellule vidée → on libère le 11 auto
      delete nextAuto[`${i}:${opp}`];
    }

    setAuto(nextAuto);
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  // Ajout/suppression de manche : les index changent → on repart d'un état auto propre.
  const add = () => {
    setAuto({});
    onChange([...value, { a: '', b: '' }]);
  };
  const removeAt = (i: number) => {
    setAuto({});
    onChange(value.filter((_, idx) => idx !== i));
  };

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
              onChangeText={(t) => editCell(i, 'a', t)}
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
              onChangeText={(t) => editCell(i, 'b', t)}
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
          <Ionicons name="add" size={18} color={Palette.onyx} />
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
    borderColor: Palette.border,
    borderStyle: 'dashed',
    marginTop: Spacing.one,
  },
});
