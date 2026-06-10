import { View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function FeedScreen() {
  return (
    <Screen title="Feed" subtitle="L'activité du club, en temps réel.">
      <Card>
        <ThemedText type="label" themeColor="info">
          Sprint 2 · 📣 Feed & Social
        </ThemedText>
        <ThemedText type="cardTitle">Bientôt ici</ThemedText>
        <View style={{ gap: Spacing.one, marginTop: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">
            • Matchs récents & résultats ELO en direct
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Nouveaux membres du club Ping Pang Paris
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Défis lancés & relevés
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}
