import { View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function CarteScreen() {
  return (
    <Screen title="Carte" subtitle="Trouve une table près de toi.">
      <Card>
        <ThemedText type="label" themeColor="info">
          Sprint 3 · 🗺️ Map & Tables
        </ThemedText>
        <ThemedText type="cardTitle">Carte interactive à venir</ThemedText>
        <View style={{ gap: Spacing.one, marginTop: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">
            • Tables & clubs (pingpongmap.net) + géolocalisation
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Filtres Intérieur / Extérieur
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            • Événements Ping Pang Paris (Podplay) & réservation créneau
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}
