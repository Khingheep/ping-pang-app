import { StyleSheet, View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function ProfilScreen() {
  return (
    <Screen title="Profil" subtitle="Ton niveau, tes stats, ton historique.">
      <Card style={styles.eloCard}>
        <ThemedText type="label" themeColor="textSecondary">
          ELO actuel
        </ThemedText>
        <ThemedText type="metric" themeColor="brand">
          1200
        </ThemedText>
        <View style={styles.levelRow}>
          <ThemedText type="smallBold" themeColor="onBrand" style={styles.levelTag}>
            ROOKIE
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            Rookie · Amateur · Confirmé · Expert · Master · Elite · Legend
          </ThemedText>
        </View>
      </Card>

      <Card>
        <ThemedText type="label" themeColor="brand">
          Mission 02 · 📊 Dashboard Training
        </ThemedText>
        <ThemedText type="cardTitle">Suivi de progression à venir</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Saisis tes entraînements, suis ton ELO (30j / 90j / all-time) et ton historique de matchs.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eloCard: { alignItems: 'flex-start' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  levelTag: {
    backgroundColor: '#E6FFA5',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    overflow: 'hidden',
  },
});
