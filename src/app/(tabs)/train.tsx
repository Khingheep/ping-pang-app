import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  fetchSessionTemplates,
  fetchTrainingSessions,
  fetchTrainingStats,
  formatDuration,
  formatHours,
  type ActivityPeriod,
  type SessionTemplate,
  type TrainingSession,
  type TrainingStats,
} from '@/lib/training/sessions';

const STROKE_COLORS = [Palette.purple, Palette.blue, Palette.lime, Palette.evergreen, Palette.green, Palette.grey];
const CHART_H = 90;

const PERIODS: { key: ActivityPeriod; label: string }[] = [
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
];

export default function TrainScreen() {
  const { session } = useAuth();
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [period, setPeriod] = useState<ActivityPeriod>('week');

  const load = useCallback(() => {
    const id = session?.user?.id;
    if (id) {
      fetchTrainingStats(id).then(setStats);
      fetchTrainingSessions(id, 5).then(setSessions);
      fetchSessionTemplates(id).then(setTemplates).catch(() => {});
    }
  }, [session?.user?.id]);

  useFocusEffect(load);

  const maxStroke = Math.max(1, ...(stats?.byStroke ?? []).map((s) => s.min));

  // Graphe d'activité filtrable : la série + le total dépendent de la période choisie.
  const activitySeries = stats?.activity[period] ?? [];
  const maxBar = Math.max(1, ...activitySeries.map((b) => b.min));
  const periodMin = period === 'week' ? stats?.weekMin : period === 'month' ? stats?.monthMin : stats?.totalMinYear;
  const periodLabel = period === 'week' ? 'cette semaine' : period === 'month' ? 'ce mois' : 'cette année';

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

          {/* Raccourcis : répéter une séance récente */}
          {templates.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tplRow}
              style={styles.tplScroll}>
              {templates.map((t) => {
                const partnerLabel = t.isSolo ? 'Solo' : t.partner?.name ?? t.partnerLevel ?? null;
                return (
                  <Pressable
                    key={t.id}
                    style={styles.tplCard}
                    onPress={() => router.push({ pathname: '/new-training', params: { template: t.id } })}>
                    <View style={styles.tplHead}>
                      <ThemedText type="cardTitle" themeColor="brand">
                        {formatDuration(t.durationMin)}
                      </ThemedText>
                      <Ionicons name="repeat" size={16} color={Palette.evergreen} />
                    </View>
                    <ThemedText type="small" numberOfLines={2}>
                      {t.strokes.length ? t.strokes.join(', ') : 'Séance'}
                    </ThemedText>
                    {partnerLabel || t.venueName ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {[partnerLabel, t.venueName].filter(Boolean).join(' · ')}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

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

          {/* Activité - filtrable par semaine / mois / année */}
          {stats ? (
            <>
              <View style={styles.activityHead}>
                <ThemedText type="sectionTitle" themeColor="textSecondary">
                  Activité
                </ThemedText>
                {periodMin && periodMin > 0 ? (
                  <ThemedText type="smallBold" themeColor="brand">
                    {formatHours(periodMin)} {periodLabel}
                  </ThemedText>
                ) : null}
              </View>

              <View style={styles.segment}>
                {PERIODS.map((p) => {
                  const active = period === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => setPeriod(p.key)}>
                      <ThemedText type="small" themeColor={active ? 'onBrand' : 'textSecondary'}>
                        {p.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.card}>
                {activitySeries.every((b) => b.min === 0) ? (
                  <ThemedText type="small" themeColor="textMuted">
                    Aucune séance sur cette période.
                  </ThemedText>
                ) : (
                  <View style={styles.chart}>
                    {activitySeries.map((b, i) => (
                      <View key={i} style={styles.chartCol}>
                        <View style={styles.barWrap}>
                          <View
                            style={{
                              width: '70%',
                              height: Math.max(3, (b.min / maxBar) * CHART_H),
                              backgroundColor: b.min > 0 ? Palette.purple : Palette.border,
                              borderRadius: 3,
                            }}
                          />
                        </View>
                        <ThemedText type="small" themeColor="textMuted" style={styles.chartLbl} numberOfLines={1}>
                          {b.label}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
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
                <Pressable
                  key={s.id}
                  style={styles.histRow}
                  onPress={() => router.push({ pathname: '/session', params: { id: s.id } })}>
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
                  <Ionicons name="chevron-forward" size={18} color={Palette.grey} />
                </Pressable>
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
  tplScroll: { marginTop: Spacing.three },
  tplRow: { gap: Spacing.two, paddingRight: Spacing.four },
  tplCard: {
    width: 168,
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  tplHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  activityHead: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segment: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginBottom: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    padding: Spacing.one,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  segmentBtnActive: { backgroundColor: Palette.evergreen },
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
