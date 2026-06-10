import { View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function TrainScreen() {
  return (
    <Screen title="Entraînements" subtitle="Note tes séances, suis ta progression.">
      <Card>
        <ThemedText type="label" themeColor="brand">
          Mission 02 · 📊 Dashboard Training
        </ThemedText>
        <ThemedText type="cardTitle">Bientôt</ThemedText>
        <View style={{ gap: Spacing.one, marginTop: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">
            • Noter un entraînement (type, durée, ressenti)
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Historique des séances
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Stats de progression & comparaison
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}
