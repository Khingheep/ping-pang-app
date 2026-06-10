import { StyleSheet, View } from 'react-native';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const PODIUM = [
  { rank: 1, name: 'À venir', elo: '—' },
  { rank: 2, name: 'À venir', elo: '—' },
  { rank: 3, name: 'À venir', elo: '—' },
];

export default function ClassementScreen() {
  return (
    <Screen title="Classement" subtitle="ELO Mondial & Paris, style Chess.com.">
      <Card>
        <ThemedText type="label" themeColor="brand">
          Mission 01 · 🏆 ELO
        </ThemedText>
        <ThemedText type="cardTitle">Top joueurs</ThemedText>
        <View style={{ marginTop: Spacing.two, gap: Spacing.two }}>
          {PODIUM.map((p) => (
            <View key={p.rank} style={styles.row}>
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.rank}>
                #{p.rank}
              </ThemedText>
              <ThemedText type="default" style={styles.name}>
                {p.name}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="brand">
                {p.elo}
              </ThemedText>
            </View>
          ))}
        </View>
      </Card>
      <ThemedText type="small" themeColor="textMuted">
        Matchs classés validés par les 2 joueurs · import du classement FFTT à venir.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rank: { width: 36 },
  name: { flex: 1 },
});
