import { StyleSheet, View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const ACTIONS = [
  { key: 'defi', label: 'Lancer un défi 1v1', mission: 'Mission 04' },
  { key: 'score', label: 'Saisir un score de match', mission: 'Mission 01' },
  { key: 'tournoi', label: 'Créer un tournoi', mission: 'Mission 04' },
];

export default function JouerScreen() {
  return (
    <Screen title="Jouer" subtitle="Défie un joueur, saisis tes scores, monte au classement.">
      {ACTIONS.map((a) => (
        <Card key={a.key} style={styles.actionCard}>
          <View style={styles.flex}>
            <ThemedText type="label" themeColor="brand">
              {a.mission}
            </ThemedText>
            <ThemedText type="cardTitle" style={{ marginTop: Spacing.half }}>
              {a.label}
            </ThemedText>
          </View>
          <View style={styles.pill}>
            <ThemedText type="smallBold" themeColor="onBrand">
              Bientôt
            </ThemedText>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: 0 },
  pill: {
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
