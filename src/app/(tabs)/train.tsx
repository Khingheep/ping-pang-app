import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { coachUrl, fetchCoaches, type Coach } from '@/lib/podplay/coaches';
import {
  fetchTrainingSessions,
  fetchTrainingStats,
  formatDuration,
  formatHours,
  type TrainingSession,
  type TrainingStats,
} from '@/lib/training/sessions';

const STROKE_COLORS = [Palette.purple, Palette.blue, Palette.lime, Palette.evergreen, Palette.green, Palette.grey];
const CHART_H = 90;

export default function TrainScreen() {
  const { session } = useAuth();
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const load = useCallback(() => {
    const id = session?.user?.id;
    if (id) {
      fetchTrainingStats(id).then(setStats);
      fetchTrainingSessions(id, 5).then(setSessions);
    }
    fetchCoaches().then(setCoaches);
  }, [session?.user?.id]);

  useFocusEffect(load);

  const maxStroke = Math.max(1, ...(stats?.byStroke ?? []).map((s) => s.min));
  const maxWeek = Math.max(1, ...(stats?.weekly ?? []).map((w) => w.min));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Entraînements</ThemedText>

          <Pressable style={styles.logBtn} onPress={() => router.push('/new-training')}>
            <Ionicons name="add" size={20} color={Palette.evergreen} />
            <ThemedText type="cardTitle" themeColor="brand">
              Renseigner mon entraînement
            </ThemedText>
          </Pressable>

          {/* Hero total */}
          <View style={styles.hero}>
            <ThemedText type="metric" style={styles.heroBig}>
              {formatHours(stats?.totalMinYear ?? 0)}
            </ThemedText>
            <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.8 }}>
              temps total d&apos;entraînement cette année
            </ThemedText>
            {stats && stats.weekMin > 0 ? (
              <View style={styles.weekTag}>
                <ThemedText type="smallBold" themeColor="brand">
                  +{formatHours(stats.weekMin)} cette semaine
                </ThemedText>
              </View>
            ) : null}
          </View>

          {/* Répartition par coup */}
          {stats && stats.byStroke.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Répartition par coup
              </ThemedText>
              <View style={styles.card}>
                {stats.byStroke.map((s, i) => (
                  <View key={s.stroke} style={styles.strokeRow}>
                    <View style={styles.strokeHead}>
                      <ThemedText type="smallBold">{s.stroke}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatHours(s.min)}
                      </ThemedText>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${Math.max(6, (s.min / maxStroke) * 100)}%`, backgroundColor: STROKE_COLORS[i % STROKE_COLORS.length] },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Activité hebdo */}
          {stats ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Activité (8 dernières semaines)
              </ThemedText>
              <View style={styles.card}>
                <View style={styles.chart}>
                  {stats.weekly.map((w, i) => (
                    <View key={i} style={styles.chartCol}>
                      <View style={styles.barWrap}>
                        <View
                          style={{
                            width: '70%',
                            height: Math.max(3, (w.min / maxWeek) * CHART_H),
                            backgroundColor: w.min > 0 ? Palette.purple : Palette.border,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                      <ThemedText type="small" themeColor="textMuted" style={styles.chartLbl}>
                        {w.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {/* Coachs */}
          {coaches.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Coachs du club
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachRow}>
                {coaches.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.coachCard}
                    onPress={() => c.slug && Linking.openURL(coachUrl(c.slug))}>
                    {c.picture_url ? (
                      <Image source={{ uri: c.picture_url }} style={styles.coachPic} contentFit="cover" />
                    ) : (
                      <View style={[styles.coachPic, styles.coachPicEmpty]} />
                    )}
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.coachName}>
                      {c.first_name} {c.last_name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {c.hourly_rate}€/h
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Mes séances (récentes) */}
          <View style={styles.seancesHead}>
            <ThemedText type="sectionTitle" themeColor="textSecondary">
              Mes séances
            </ThemedText>
            {sessions.length > 0 ? (
              <Pressable onPress={() => router.push('/mes-seances')}>
                <ThemedText type="smallBold" themeColor="brand">
                  Voir tout
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          {sessions.length === 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              Aucune séance enregistrée. Renseigne ta première séance !
            </ThemedText>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {sessions.map((s) => (
                <View key={s.id} style={styles.histRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle">
                      {formatDuration(s.duration_min)}
                      {s.feeling ? ` · ${s.feeling}` : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {s.strokes.length ? s.strokes.join(', ') : 'Séance'}
                      {s.venue ? ` · ${s.venue.name}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textMuted">
                    {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </ThemedText>
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
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  logBtn: {
    marginTop: Spacing.three,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  hero: {
    marginTop: Spacing.four,
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.md,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  heroBig: { color: Palette.lime, fontSize: 44, lineHeight: 48 },
  weekTag: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  strokeRow: { gap: Spacing.one },
  strokeHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, backgroundColor: Palette.whitePP, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H + 22, gap: Spacing.one },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barWrap: { height: CHART_H, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  chartLbl: { marginTop: Spacing.one, fontSize: 9 },
  coachRow: { gap: Spacing.three, paddingVertical: Spacing.one, paddingRight: Spacing.four },
  coachCard: { width: 96, alignItems: 'center', gap: Spacing.half },
  coachPic: { width: 96, height: 96, borderRadius: Radius.md, backgroundColor: Palette.white },
  coachPicEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  coachName: { marginTop: Spacing.one, textAlign: 'center' },
  seancesHead: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
});
