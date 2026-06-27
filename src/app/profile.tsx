/**
 * Écran PROFILE PLAYER — profil perso à 3 onglets (Vous · Entraînements · Derniers matchs).
 *
 * Structure issue du Figma « PROFILE PLAYER », re-skinné dans notre thème CLAIR
 * (evergreen + blanc + accents), pas le mock sombre. Toutes les données sont
 * réelles : profil `players`, matchs `matches`, séances `training_sessions`.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Colors, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { computeObjective, levelForElo } from '@/lib/elo';
import { computeEloProgression, computeStats, fetchRecentMatches, type MatchView } from '@/lib/matches/history';
import { parseSetScores } from '@/lib/matches/sets';
import { fetchMyProfile, type PlayerProfile } from '@/lib/players/profile';
import { fetchTrainingSessions, formatDuration, type TrainingSession } from '@/lib/training/sessions';

const TRACK = Colors.light.backgroundSelected; // fond des barres de progression sur card blanche

const TABS = ['Vous', 'Entraînements', 'Derniers matchs'] as const;

const FEELING_COLOR: Record<string, string> = {
  Excellent: Palette.green,
  Bien: Palette.lime,
  Moyen: Palette.blue,
  Difficile: Palette.red,
};

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function weekdayShort(iso: string): string {
  const s = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/** Chemin SVG lissé (Catmull-Rom → bézier) passant par tous les points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Courbe d'évolution de l'ELO cumulé (Figma « Vous »). */
function ProgressCurve({ series }: { series: number[] }) {
  const width = Dimensions.get('window').width - Spacing.four * 2 - Spacing.four * 2;
  const height = 120;
  if (series.length < 2) {
    return (
      <ThemedText type="small" themeColor="textMuted">
        Pas encore assez de matchs classés pour tracer la courbe.
      </ThemedText>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);
  const pad = 12;
  const pts = series.map((v, i) => ({
    x: (i / (series.length - 1)) * width,
    y: pad + (1 - (v - min) / span) * (height - 2 * pad),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x},${height} L ${pts[0].x},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={area} fill={Palette.lime} opacity={0.3} />
      <Path d={line} stroke={Palette.evergreen} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={4.5} fill={Palette.evergreen} />
    </Svg>
  );
}

/** Grille d'activité 5 semaines × 7 jours (lundi→dimanche), pastille pleine si activité ce jour-là. */
function ActivityGrid({ days }: { days: Set<string> }) {
  const WEEKS = 5;
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // lundi = 0
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (WEEKS - 1) * 7);

  const rows = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const cell = new Date(start);
      cell.setDate(start.getDate() + w * 7 + d);
      const future = cell.getTime() > today.getTime();
      return { active: days.has(cell.toISOString().slice(0, 10)), future };
    }),
  );

  return (
    <View style={styles.grid}>
      <View style={styles.gridHead}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => (
          <View key={i} style={styles.gridCell}>
            <ThemedText type="small" themeColor="textMuted" style={styles.gridHeadLbl}>
              {l}
            </ThemedText>
          </View>
        ))}
      </View>
      {rows.map((row, w) => (
        <View key={w} style={styles.gridRow}>
          {row.map((c, d) => (
            <View key={d} style={styles.gridCell}>
              <View
                style={[
                  styles.dot,
                  c.active && styles.dotOn,
                  c.future && styles.dotFuture,
                ]}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [tab, setTab] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchMyProfile(id).then(setProfile);
      fetchRecentMatches(id, 200).then(setMatches);
      fetchTrainingSessions(id, 200).then(setSessions);
    }, [session?.user?.id]),
  );

  const name = profile?.display_name ?? 'Joueur';
  const elo = profile?.elo ?? 1200;
  const level = levelForElo(elo);
  const stats = computeStats(matches);
  const confirmed = matches.filter((m) => m.status === 'confirmed');

  // Meilleure perf / plus grosse contre = meilleur gain et pire perte d'ELO.
  const deltas = confirmed.map((m) => m.delta).filter((d) => d !== 0);
  const bestPerf = deltas.length ? Math.max(...deltas) : null;
  const worstContre = deltas.length ? Math.min(...deltas) : null;

  const objective = computeObjective(elo);
  const progression = computeEloProgression(matches);

  // Série d'ELO cumulé (du plus ancien au plus récent) pour la courbe.
  const eloSeries = (() => {
    const chrono = confirmed.filter((m) => m.ranked).reverse();
    if (chrono.length < 2) return [];
    let acc = elo - chrono.reduce((s, m) => s + m.delta, 0);
    const pts = [acc];
    for (const m of chrono) {
      acc += m.delta;
      pts.push(acc);
    }
    return pts;
  })();

  const activeDays = new Set<string>([
    ...confirmed.map((m) => dayKey(m.date)),
    ...sessions.map((s) => dayKey(s.created_at)),
  ]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Profil</ThemedText>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color={Palette.onyx} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={styles.hero}>
            <Avatar name={name} size={56} color={Palette.purple} uri={profile?.avatar_url} />
            <View style={styles.heroText}>
              <ThemedText type="subtitle">{name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {profile?.player_type ?? level.label}
              </ThemedText>
              {profile?.city ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {profile.city}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {/* Perf pills */}
          <View style={styles.pillRow}>
            <View style={[styles.pill, styles.pillUp]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.pillLabel}>
                Meilleure perf
              </ThemedText>
              <ThemedText type="cardTitle" style={{ color: Palette.evergreen }}>
                {bestPerf !== null ? `+${bestPerf}` : '—'}
              </ThemedText>
            </View>
            <View style={[styles.pill, styles.pillDown]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.pillLabel}>
                Plus grosse contre
              </ThemedText>
              <ThemedText type="cardTitle" style={{ color: Palette.redInk }}>
                {worstContre !== null ? worstContre : '—'}
              </ThemedText>
            </View>
          </View>

          {/* Segmented tabs */}
          <View style={styles.tabs}>
            {TABS.map((t, i) => (
              <Pressable
                key={t}
                onPress={() => setTab(i)}
                style={[styles.tab, tab === i ? styles.tabOn : styles.tabOff]}>
                <ThemedText type="smallBold" themeColor={tab === i ? 'onBrand' : 'text'} numberOfLines={1}>
                  {t}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {tab === 0 ? (
            <View style={styles.tabBody}>
              {/* Objectif */}
              <View style={styles.objCard}>
                <View style={styles.objTop}>
                  <View style={styles.ring}>
                    <ThemedText type="smallBold" style={{ color: Palette.evergreen }}>
                      {Math.round(objective.pct * 100)}%
                    </ThemedText>
                  </View>
                  <View style={styles.objText}>
                    <ThemedText type="cardTitle">{objective.toGain} points à gagner</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Objectif · atteindre {objective.target}
                      {objective.nextLabel ? ` (${objective.nextLabel})` : ''}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(objective.pct * 100)}%` }]} />
                </View>
              </View>

              {/* Matchs joués */}
              <View style={styles.playedRow}>
                <View style={styles.barTrackLg}>
                  <View style={[styles.barFill, { width: `${Math.round(objective.pct * 100)}%` }]} />
                </View>
                <View style={styles.playedCount}>
                  <ThemedText type="title" themeColor="brand" style={styles.playedNum}>
                    {stats.total}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    matchs joués
                  </ThemedText>
                </View>
              </View>

              {/* Progression ELO */}
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Progression
              </ThemedText>
              <View style={styles.card}>
                <View style={styles.progHead}>
                  <ThemedText type="title" themeColor="brand" style={styles.progElo}>
                    {elo}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor={progression.thisMonth >= 0 ? 'brand' : 'danger'}>
                    {progression.thisMonth >= 0 ? '+' : ''}
                    {progression.thisMonth} ce mois
                  </ThemedText>
                </View>
                <View style={styles.curveWrap}>
                  <ProgressCurve series={eloSeries} />
                </View>
              </View>

              {/* Activité */}
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Activité
              </ThemedText>
              <View style={styles.card}>
                <ActivityGrid days={activeDays} />
              </View>
            </View>
          ) : null}

          {tab === 1 ? (
            <View style={styles.tabBody}>
              <Pressable style={styles.addBtn} onPress={() => router.push('/new-training')}>
                <Ionicons name="add-circle-outline" size={22} color={Palette.evergreen} />
                <ThemedText type="cardTitle" themeColor="brand">
                  Rajouter une séance
                </ThemedText>
              </Pressable>

              {sessions.length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    Aucune séance enregistrée. Note ta première séance ! 🏓
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {sessions.map((s) => (
                    <View key={s.id} style={styles.sessionRow}>
                      <View style={styles.sessionDate}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {weekdayShort(s.created_at)}
                        </ThemedText>
                        <ThemedText type="cardTitle">{dayMonth(s.created_at)}</ThemedText>
                      </View>
                      <View style={styles.sessionBig}>
                        <View style={[styles.feelingDot, { backgroundColor: (s.feeling && FEELING_COLOR[s.feeling]) || Palette.border }]} />
                        <View style={{ flex: 1 }}>
                          <ThemedText type="cardTitle" numberOfLines={1}>
                            {s.strokes.length ? `Session ${s.strokes[0]}` : 'Séance'}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatDuration(s.duration_min)}
                            {s.feeling ? ` · ${s.feeling}` : ''}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {tab === 2 ? (
            <View style={styles.tabBody}>
              {confirmed.length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    Aucun match confirmé pour l&apos;instant.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {confirmed.map((m) => {
                    const sets = parseSetScores(m.setScores);
                    return (
                      <View key={m.id} style={styles.matchRow}>
                        <View style={styles.matchPlayers}>
                          <View style={[styles.namePill, m.won ? styles.pillWin : styles.pillLose]}>
                            <ThemedText type="small" numberOfLines={1}>
                              {name}
                            </ThemedText>
                          </View>
                          <View style={[styles.namePill, m.won ? styles.pillLose : styles.pillWin]}>
                            <ThemedText type="small" numberOfLines={1}>
                              {m.opponent}
                            </ThemedText>
                          </View>
                        </View>

                        {sets.length ? (
                          <View style={styles.setGrid}>
                            <View style={styles.setGridRow}>
                              {sets.map((s, i) => (
                                <View key={i} style={styles.setCell}>
                                  <ThemedText type="smallBold" themeColor={s.a >= s.b ? 'text' : 'textMuted'}>
                                    {s.a}
                                  </ThemedText>
                                </View>
                              ))}
                            </View>
                            <View style={styles.setGridRow}>
                              {sets.map((s, i) => (
                                <View key={i} style={styles.setCell}>
                                  <ThemedText type="smallBold" themeColor={s.b > s.a ? 'text' : 'textMuted'}>
                                    {s.b}
                                  </ThemedText>
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <ThemedText type="subtitle" themeColor={m.won ? 'brand' : 'textMuted'}>
                            {m.score || '—'}
                          </ThemedText>
                        )}

                        <ThemedText
                          type="cardTitle"
                          style={[styles.matchDelta, { color: m.delta > 0 ? Palette.evergreen : m.delta < 0 ? Palette.redInk : Palette.grey }]}>
                          {m.delta ? `${m.delta > 0 ? '+' : ''}${m.delta}` : '—'}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },

  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  heroText: { flex: 1, gap: Spacing.half },

  pillRow: { flexDirection: 'row', gap: Spacing.two },
  pill: {
    flex: 1,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  pillUp: { borderColor: Palette.green },
  pillDown: { borderColor: Palette.red },
  pillLabel: { fontSize: 11 },

  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { flex: 1, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderRadius: Radius.xs, alignItems: 'center' },
  tabOn: { backgroundColor: Palette.evergreen },
  tabOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  tabBody: { gap: Spacing.three },

  objCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  objTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  ring: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objText: { flex: 1, gap: Spacing.half },
  barTrack: { height: 8, borderRadius: Radius.pill, backgroundColor: TRACK, overflow: 'hidden' },
  barTrackLg: { flex: 1, height: 12, borderRadius: Radius.pill, backgroundColor: TRACK, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Palette.evergreen, borderRadius: Radius.pill },

  playedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  playedCount: { alignItems: 'flex-end' },
  playedNum: { fontSize: 40, lineHeight: 44 },

  section: { marginTop: Spacing.one },
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },

  progHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progElo: { fontSize: 34, lineHeight: 38 },
  curveWrap: { marginTop: Spacing.three, alignItems: 'center' },

  grid: { gap: Spacing.two },
  gridHead: { flexDirection: 'row' },
  gridHeadLbl: { fontSize: 10 },
  gridRow: { flexDirection: 'row' },
  gridCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.half },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, backgroundColor: Palette.whitePP },
  dotOn: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  dotFuture: { opacity: 0.3 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.evergreen,
  },
  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  list: { gap: Spacing.two },

  sessionRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  sessionDate: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
  },
  sessionBig: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  feelingDot: { width: 10, height: 10, borderRadius: 5 },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  matchPlayers: { flex: 1, gap: Spacing.one },
  namePill: { borderRadius: Radius.xs, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, alignSelf: 'flex-start', maxWidth: '100%' },
  pillWin: { backgroundColor: Palette.green },
  pillLose: { backgroundColor: Palette.red },
  setGrid: { gap: Spacing.one },
  setGridRow: { flexDirection: 'row', gap: Spacing.one },
  setCell: {
    width: 26,
    height: 24,
    borderRadius: Radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchDelta: { width: 44, textAlign: 'right' },
});
