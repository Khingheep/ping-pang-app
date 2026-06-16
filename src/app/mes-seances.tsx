import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  fetchTrainingSessions,
  fetchTrainingStats,
  formatDuration,
  formatHours,
  type TrainingSession,
} from '@/lib/training/sessions';

const FEELING_COLOR: Record<string, string> = {
  Excellent: Palette.green,
  Bien: Palette.lime,
  Moyen: Palette.blue,
  Difficile: Palette.red,
};

function sessionDate(iso: string): string {
  const s = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MesSeancesScreen() {
  const { session } = useAuth();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [total, setTotal] = useState({ min: 0, count: 0 });

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchTrainingSessions(id, 200).then(setSessions);
      fetchTrainingStats(id).then((s) => setTotal({ min: s.totalMinYear, count: s.count }));
    }, [session?.user?.id]),
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Mes séances</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="default" themeColor="textSecondary">
            {formatHours(total.min)} au total · {total.count} séance{total.count > 1 ? 's' : ''}
          </ThemedText>

          {sessions.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="default" themeColor="textSecondary">
                Aucune séance enregistrée. Note ta première séance ! 🏓
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {sessions.map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={[styles.bar, { backgroundColor: (s.feeling && FEELING_COLOR[s.feeling]) || Palette.border }]} />
                  <View style={styles.cardMain}>
                    <ThemedText type="cardTitle">{sessionDate(s.created_at)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDuration(s.duration_min)}
                      {s.feeling ? ` · ${s.feeling}` : ''}
                      {s.partner_level ? ` · ${s.partner_level}` : ''}
                    </ThemedText>
                    {s.strokes.length ? (
                      <ThemedText type="small" themeColor="brand" style={{ marginTop: Spacing.half }}>
                        {s.strokes.join(', ')}
                      </ThemedText>
                    ) : null}
                    {s.venue ? (
                      <ThemedText type="small" themeColor="textMuted">
                        {s.venue.name}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  list: { gap: Spacing.two },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  bar: { width: 5, alignSelf: 'stretch' },
  cardMain: { flex: 1, padding: Spacing.three, paddingLeft: Spacing.three },
});
