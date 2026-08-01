/**
 * Carte repliable « Comment marche le classement ? » — explique le barème ELO en clair.
 * Cf. retour fondateur : les gens doivent comprendre points / différences / V-D.
 * Réutilisable sur le classement ET l'écran de match.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const POINTS: { label: string; detail: string }[] = [
  { label: 'Chaque match validé fait bouger ton classement.', detail: '' },
  { label: 'Battre plus fort que toi', detail: 'rapporte plus de points.' },
  { label: 'Perdre contre moins bien classé', detail: 'en coûte plus.' },
  { label: 'Un match se valide à deux', detail: 'le gagnant saisit le score, le perdant confirme.' },
  { label: 'Ton classement se stabilise', detail: 'après une dizaine de matchs.' },
  { label: 'Les matchs à handicap', detail: 'comptent 50/50 : joue contre plus fort sans fausser ton ELO.' },
];

export function RankingExplainer({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <View style={styles.headLeft}>
          <View style={styles.badge}>
            <Ionicons name="help" size={16} color={Palette.onyx} />
          </View>
          <ThemedText type="cardTitle">Comment marche le classement ?</ThemedText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Palette.grey} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {POINTS.map((p) => (
            <View key={p.label} style={styles.row}>
              <View style={styles.dot} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.rowText}>
                <ThemedText type="smallBold">{p.label}</ThemedText>
                {p.detail ? ` ${p.detail}` : ''}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.one },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  body: { gap: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.onyx, marginTop: 7 },
  rowText: { flex: 1, lineHeight: 19 },
});
