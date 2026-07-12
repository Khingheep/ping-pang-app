import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/progress-ring';
import { StepSlider } from '@/components/step-slider';
import { SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { updateWeeklyGoal, useMyProfile } from '@/lib/players/profile';
import { notify } from '@/lib/ui/alert';
import {
  fetchSessionTemplates,
  fetchTrainingSessions,
  fetchTrainingStats,
  formatDuration,
  formatHours,
  partnersLabel,
  type ActivityPeriod,
  type SessionTemplate,
  type TrainingSession,
  type TrainingStats,
} from '@/lib/training/sessions';

const CHART_H = 90;
const WEEKLY_GOAL_MIN = 180; // objectif hebdo par défaut : 3h/semaine

const PERIODS: { key: ActivityPeriod; label: string }[] = [
  { key: 'week', label: 'Sem' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'An' },
];

export default function TrainScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const profileQ = useMyProfile(myId);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [period, setPeriod] = useState<ActivityPeriod>('week');

  // Objectif hebdo configurable (champ profil ; null = défaut app 3h).
  const goalMin = profileQ.data?.weekly_goal_min ?? WEEKLY_GOAL_MIN;
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(WEEKLY_GOAL_MIN);
  const [savingGoal, setSavingGoal] = useState(false);

  const openGoal = () => {
    setGoalDraft(goalMin);
    setGoalOpen(true);
  };

  const saveGoal = async () => {
    if (!myId || savingGoal) return;
    setSavingGoal(true);
    try {
      await updateWeeklyGoal(myId, goalDraft);
      await profileQ.refetch();
      setGoalOpen(false);
    } catch {
      notify('Oups', "Impossible d'enregistrer l'objectif. Réessaie.");
    } finally {
      setSavingGoal(false);
    }
  };

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

  // Hero « coach » : progression vers l'objectif hebdo + série.
  const weekMin = stats?.weekMin ?? 0;
  const streak = stats?.streak ?? 0;
  const goalProgress = Math.min(1, weekMin / goalMin);

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

          {/* Hero « coach » : anneau objectif hebdo + série 🔥 (tap = éditer l'objectif) */}
          <Pressable
            testID="train-hero"
            accessibilityRole="button"
            accessibilityLabel="Modifier l'objectif hebdomadaire"
            style={styles.hero}
            onPress={openGoal}>
            <Ionicons name="create-outline" size={16} color="rgba(245,243,243,0.5)" style={styles.heroEdit} />
            <ProgressRing progress={goalProgress} size={78} color={Palette.lime}>
              <View style={{ alignItems: 'center' }}>
                <ThemedText type="cardTitle" style={{ color: Palette.whitePP }}>
                  {formatDuration(weekMin)}
                </ThemedText>
                <ThemedText testID="hero-goal" type="small" style={styles.heroGoal}>
                  / {formatDuration(goalMin)}
                </ThemedText>
              </View>
            </ProgressRing>
            <View style={{ flex: 1 }}>
              <ThemedText type="cardTitle" style={{ color: Palette.whitePP }}>
                {streak > 0 ? `🔥 ${streak} semaine${streak > 1 ? 's' : ''} de suite` : 'Ta semaine 🏓'}
              </ThemedText>
              <ThemedText type="small" style={styles.heroSub}>
                {weekMin >= goalMin
                  ? 'Objectif de la semaine atteint 💪'
                  : weekMin > 0
                    ? `Plus que ${goalMin - weekMin} min pour ton objectif`
                    : 'Lance ta première séance de la semaine'}
              </ThemedText>
            </View>
          </Pressable>

          {/* CTA principal */}
          <Pressable style={styles.logBtn} onPress={() => router.push('/new-training')}>
            <ThemedText type="cardTitle" style={styles.logBtnTxt}>
              🏓  J&apos;ai joué
            </ThemedText>
          </Pressable>

          {/* Reprendre une séance récente */}
          {templates.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Reprendre une séance
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tplRow}
                style={styles.tplScroll}>
                {templates.map((t) => {
                  const partnerLabel = t.isSolo ? 'Solo' : partnersLabel(t) ?? t.partnerLevel ?? null;
                  return (
                    <Pressable
                      key={t.id}
                      style={styles.tplCard}
                      onPress={() => router.push({ pathname: '/new-training', params: { template: t.id } })}>
                      <View style={styles.tplHead}>
                        <ThemedText type="cardTitle" themeColor="brand">
                          {formatDuration(t.durationMin)}
                        </ThemedText>
                        <Ionicons name="repeat" size={16} color={Palette.onyx} />
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
            </>
          ) : null}

          {/* Tuiles « cette année » */}
          {stats ? (
            <View style={styles.tiles}>
              <View style={styles.tile}>
                <ThemedText style={styles.tileNum}>{formatHours(stats.totalMinYear)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Cette année
                </ThemedText>
              </View>
              <View style={styles.tile}>
                <ThemedText style={styles.tileNum}>{stats.count}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Séances
                </ThemedText>
              </View>
              <View style={styles.tile}>
                <ThemedText style={styles.tileNum}>
                  {stats.weekMin > 0 ? `+${formatHours(stats.weekMin)}` : '—'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Cette sem.
                </ThemedText>
              </View>
            </View>
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
                              // Barre courante (dernière de la série) en onyx, le reste en gris.
                              backgroundColor:
                                b.min > 0
                                  ? i === activitySeries.length - 1
                                    ? Palette.onyx
                                    : Palette.grey
                                  : Palette.border,
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

          {/* Répartition par coup */}
          {stats && stats.byStroke.length > 0 ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Répartition par coup
              </ThemedText>
              <View style={styles.card}>
                {stats.byStroke.map((s) => (
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
                          { width: `${Math.max(6, (s.min / maxStroke) * 100)}%`, backgroundColor: Palette.onyx },
                        ]}
                      />
                    </View>
                  </View>
                ))}
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
              Aucune séance enregistrée. Note ta première séance !
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

      {/* Éditeur d'objectif hebdo */}
      <SwipeSheet visible={goalOpen} onClose={() => setGoalOpen(false)} style={styles.goalSheet}>
        <ThemedText type="sectionTitle">Objectif hebdomadaire</ThemedText>
        <ThemedText testID="goal-value" style={styles.goalValue}>
          {formatDuration(goalDraft)}
        </ThemedText>
        <View testID="goal-slider">
          <StepSlider value={goalDraft} min={30} max={600} step={30} onChange={setGoalDraft} />
        </View>
        <View style={styles.goalScaleRow}>
          <ThemedText type="small" themeColor="textMuted">
            30 min
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            10 h
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.goalHint}>
          Le temps de jeu que tu vises chaque semaine. L&apos;anneau suit ta progression.
        </ThemedText>
        <Pressable
          testID="goal-save"
          accessibilityRole="button"
          style={[styles.goalSave, savingGoal && { opacity: 0.6 }]}
          disabled={savingGoal}
          onPress={saveGoal}>
          <ThemedText type="cardTitle" style={styles.goalSaveTxt}>
            {savingGoal ? 'Enregistrement…' : 'Enregistrer'}
          </ThemedText>
        </Pressable>
      </SwipeSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },

  hero: {
    marginTop: Spacing.four,
    backgroundColor: Palette.onyx,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  heroGoal: { color: 'rgba(245,243,243,0.6)', fontSize: 11, lineHeight: 14 },
  heroSub: { color: 'rgba(245,243,243,0.72)', marginTop: 2 },
  heroEdit: { position: 'absolute', top: Spacing.three, right: Spacing.three },

  goalSheet: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three },
  goalValue: { fontFamily: 'OpenSauceOne-Bold', fontSize: 34, color: Palette.onyx, textAlign: 'center' },
  goalScaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalHint: { textAlign: 'center' },
  goalSave: {
    height: 54,
    borderRadius: Radius.xs,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  goalSaveTxt: { color: Palette.whitePP },

  logBtn: {
    marginTop: Spacing.three,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: Palette.lime,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnTxt: { color: Palette.evergreen, fontSize: 19 },

  tiles: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  tile: { flex: 1, backgroundColor: Palette.white, borderRadius: Radius.sm, padding: Spacing.three, gap: Spacing.half },
  tileNum: { fontFamily: 'OpenSauceOne-Bold', fontSize: 22, color: Palette.onyx },

  tplScroll: { marginTop: 0 },
  tplRow: { gap: Spacing.two, paddingRight: Spacing.four },
  tplCard: {
    width: 168,
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  tplHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  activityHead: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segment: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.xs,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  segmentBtnActive: { backgroundColor: Palette.ink2, borderColor: Palette.ink2 },
  card: {
    backgroundColor: Palette.white,
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
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
});
