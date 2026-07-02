/**
 * Écran PROFILE PLAYER - profil perso à 3 onglets (Vous · Entraînements · Derniers matchs).
 *
 * Structure issue du Figma « PROFILE PLAYER », re-skinné dans notre thème CLAIR
 * (evergreen + blanc + accents), pas le mock sombre. Toutes les données sont
 * réelles : profil `players`, matchs `matches`, séances `training_sessions`.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Colors, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { computeObjective, levelForElo, manualObjective, type Objective } from '@/lib/elo';
import { fetchFfttHistory, type FfttRankingPoint } from '@/lib/fftt/link';
import { fetchFfttMatches, type FfttMatchView } from '@/lib/fftt/matches';
import {
  buildEloProgression,
  computeStats,
  fetchRatingHistory,
  fetchRecentMatches,
  type MatchView,
  type RatingPoint,
} from '@/lib/matches/history';
import { parseSetScores } from '@/lib/matches/sets';
import { fetchHomeVenue, fetchMyProfile, setHomeVenue, updateMyGoal, type PlayerProfile } from '@/lib/players/profile';
import { fetchTrainingSessions, type TrainingSession } from '@/lib/training/sessions';
import { notify } from '@/lib/ui/alert';
import { type Venue } from '@/lib/venues/venues';
import { ClubSearch } from '@/components/club-search';
import { SwipeSheet } from '@/components/swipe-sheet';

const TRACK = Colors.light.backgroundSelected; // fond des barres de progression sur card blanche

const TABS = ['Vous', 'Derniers matchs'] as const;

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "janv. 2027" depuis une date ISO "YYYY-MM-DD" (parse littéral pour éviter les décalages de fuseau). */
function monthYearLabel(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS_FR[Number(m) - 1]} ${y}`;
}

/** Date courte "12/03" depuis une date ISO. */
function shortDate(iso: string): string {
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

/** Courbe de l'historique de classement officiel FFTT (points par phase, depuis ~2012). */
function FfttHistoryCurve({ history }: { history: FfttRankingPoint[] }) {
  const width = Dimensions.get('window').width - Spacing.four * 2 - Spacing.four * 2;
  const height = 120;
  if (history.length < 2) {
    return (
      <ThemedText type="small" themeColor="textMuted">
        Historique de classement indisponible.
      </ThemedText>
    );
  }
  const vals = history.map((h) => h.points);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const pad = 12;
  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * width,
    y: pad + (1 - (v - min) / span) * (height - 2 * pad),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x},${height} L ${pts[0].x},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={area} fill={Palette.blue} opacity={0.18} />
      <Path d={line} stroke={Palette.blue} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={4.5} fill={Palette.blue} />
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
  const [ratingHistory, setRatingHistory] = useState<RatingPoint[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [ffttHistory, setFfttHistory] = useState<FfttRankingPoint[]>([]);
  const [ffttMatches, setFfttMatches] = useState<FfttMatchView[]>([]);
  const [tab, setTab] = useState(0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [homeVenue, setHomeVenueState] = useState<Venue | null>(null);
  const [clubOpen, setClubOpen] = useState(false);
  const [clubDraft, setClubDraft] = useState<Venue | null>(null);

  const reload = useCallback(() => {
    const id = session?.user?.id;
    if (!id) return;
    fetchHomeVenue(id).then(setHomeVenueState);
    fetchMyProfile(id).then((p) => {
      setProfile(p);
      if (p?.fftt_id) {
        fetchFfttHistory(p.fftt_id).then(setFfttHistory).catch(() => {});
        fetchFfttMatches(p.fftt_id).then(setFfttMatches).catch(() => {});
      } else {
        setFfttHistory([]);
        setFfttMatches([]);
      }
    });
    fetchRecentMatches(id, 200).then(setMatches);
    fetchRatingHistory(id, 180).then(setRatingHistory);
    fetchTrainingSessions(id, 200).then(setSessions);
  }, [session?.user?.id]);

  useFocusEffect(reload);

  const name = profile?.display_name ?? 'Joueur';
  const elo = profile?.elo ?? 1200;
  const level = levelForElo(elo);
  const stats = computeStats(matches);
  const confirmed = matches.filter((m) => m.status === 'confirmed');

  // Meilleure perf / plus grosse contre = meilleur gain et pire perte d'ELO.
  const deltas = confirmed.map((m) => m.delta).filter((d) => d !== 0);
  const bestPerf = deltas.length ? Math.max(...deltas) : null;
  const worstContre = deltas.length ? Math.min(...deltas) : null;

  // Objectif manuel (si fixé) sinon palier auto. La progression part de l'ELO figé à la création.
  const hasGoal = profile?.goal_elo != null;
  const objective: Objective = hasGoal
    ? manualObjective(elo, profile!.goal_elo!, profile!.goal_start_elo ?? elo)
    : computeObjective(elo);
  const progression = buildEloProgression(ratingHistory, elo);

  // Liste unifiée « Derniers matchs » : matchs Ping Pang confirmés + matchs officiels FFTT,
  // triés du plus récent au plus ancien (les matchs sans date FFTT lisible passent en fin).
  const unifiedMatches = useMemo(() => {
    const ppp = confirmed.map((m) => ({ source: 'ppp' as const, date: m.date, ppp: m }));
    const fftt = ffttMatches.map((m) => ({ source: 'fftt' as const, date: m.date ?? '', fftt: m }));
    return [...ppp, ...fftt].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [confirmed, ffttMatches]);

  // --- Éditeur d'objectif ---
  const [goalEloInput, setGoalEloInput] = useState('');
  const [goalMonthIso, setGoalMonthIso] = useState<string | null>(null);

  // 18 prochains mois (1er du mois) comme échéances possibles.
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
    return out;
  }, []);

  function openGoal() {
    setGoalEloInput(profile?.goal_elo != null ? String(profile.goal_elo) : String(computeObjective(elo).target));
    setGoalMonthIso(profile?.goal_deadline ?? null);
    setGoalOpen(true);
  }

  async function saveGoal() {
    const id = session?.user?.id;
    if (!id) return;
    const target = parseInt(goalEloInput, 10);
    if (!target || target <= elo) {
      notify('Objectif', `Choisis un ELO supérieur à ton ELO actuel (${elo}).`);
      return;
    }
    try {
      await updateMyGoal(id, { goalElo: target, goalDeadline: goalMonthIso, currentElo: elo });
      setGoalOpen(false);
      reload();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    }
  }

  async function removeGoal() {
    const id = session?.user?.id;
    if (!id) return;
    await updateMyGoal(id, null).catch(() => {});
    setGoalOpen(false);
    reload();
  }

  function openClub() {
    setClubDraft(homeVenue);
    setClubOpen(true);
  }

  async function saveClub() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      await setHomeVenue(id, clubDraft?.id ?? null);
      setClubOpen(false);
      reload();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    }
  }

  // Série d'ELO (du plus ancien au plus récent) pour la courbe, issue de l'historique de rating.
  const eloSeries = progression.series;

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
                {profile?.bio?.trim() || profile?.player_type || level.label}
              </ThemedText>
              {homeVenue || profile?.fftt_club || profile?.city ? (
                <View style={styles.heroMeta}>
                  {homeVenue ? (
                    <View style={styles.heroMetaItem}>
                      <Ionicons name="home-outline" size={13} color={Colors.light.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {homeVenue.name}
                      </ThemedText>
                    </View>
                  ) : null}
                  {profile?.fftt_club ? (
                    <View style={styles.heroMetaItem}>
                      <Ionicons name="ribbon-outline" size={13} color={Colors.light.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {profile.fftt_club}
                      </ThemedText>
                    </View>
                  ) : null}
                  {profile?.city ? (
                    <View style={styles.heroMetaItem}>
                      <Ionicons name="location-outline" size={13} color={Colors.light.textSecondary} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {profile.city}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
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
                {bestPerf !== null ? `+${bestPerf}` : '-'}
              </ThemedText>
            </View>
            <View style={[styles.pill, styles.pillDown]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.pillLabel}>
                Plus grosse contre
              </ThemedText>
              <ThemedText type="cardTitle" style={{ color: Palette.redInk }}>
                {worstContre !== null ? worstContre : '-'}
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
              {/* Objectif (éditable : appui = éditeur) */}
              <Pressable style={styles.objCard} onPress={openGoal}>
                <View style={styles.objTop}>
                  <View style={styles.ring}>
                    {hasGoal ? (
                      <ThemedText type="smallBold" style={{ color: Palette.evergreen }}>
                        {Math.round(objective.pct * 100)}%
                      </ThemedText>
                    ) : (
                      <Ionicons name="flag-outline" size={20} color={Palette.evergreen} />
                    )}
                  </View>
                  <View style={styles.objText}>
                    {hasGoal ? (
                      <>
                        <ThemedText type="cardTitle">
                          {objective.toGain > 0 ? `${objective.toGain} points à gagner` : 'Objectif atteint 🎉'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Atteindre {objective.target}
                          {profile?.goal_deadline ? ` · avant ${monthYearLabel(profile.goal_deadline)}` : ''}
                        </ThemedText>
                      </>
                    ) : (
                      <>
                        <ThemedText type="cardTitle">Définis ton objectif</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Fixe un ELO à atteindre et une échéance.
                        </ThemedText>
                      </>
                    )}
                  </View>
                  <Ionicons name="pencil" size={16} color={Palette.grey} />
                </View>
                {hasGoal ? (
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.round(objective.pct * 100)}%` }]} />
                  </View>
                ) : null}
              </Pressable>

              {/* Mon club (éditable) */}
              <Pressable style={styles.objCard} onPress={openClub}>
                <View style={styles.objTop}>
                  <View style={styles.clubIcon}>
                    <Ionicons name="home" size={20} color={Palette.evergreen} />
                  </View>
                  <View style={styles.objText}>
                    <ThemedText type="cardTitle" numberOfLines={1}>
                      {homeVenue ? homeVenue.name : 'Définis ton club'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {homeVenue ? homeVenue.address ?? 'Ton club apparaît sur la carte' : 'Choisis ton club ou ton spot habituel'}
                    </ThemedText>
                  </View>
                  <Ionicons name="pencil" size={16} color={Palette.grey} />
                </View>
              </Pressable>

              {/* Matchs joués */}
              <View style={styles.playedRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Matchs joués
                </ThemedText>
                <ThemedText type="title" themeColor="brand" style={styles.playedNum}>
                  {stats.total}
                </ThemedText>
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

              {/* Historique classement FFTT */}
              {profile?.fftt_id && ffttHistory.length >= 2 ? (
                <>
                  <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                    Classement FFTT
                  </ThemedText>
                  <View style={styles.card}>
                    <View style={styles.progHead}>
                      <ThemedText type="title" themeColor="brand" style={styles.progElo}>
                        {ffttHistory[ffttHistory.length - 1].points} pts
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        depuis {ffttHistory[0].date.slice(0, 4)}
                      </ThemedText>
                    </View>
                    <View style={styles.curveWrap}>
                      <FfttHistoryCurve history={ffttHistory} />
                    </View>
                  </View>
                </>
              ) : null}

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
              {unifiedMatches.length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    Aucun match pour l&apos;instant.
                    {profile?.fftt_id ? '' : ' Lie ton compte FFTT pour voir tes matchs officiels.'}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {unifiedMatches.map((item) =>
                    item.source === 'ppp' ? (
                      <PppMatchCard key={`ppp-${item.ppp.id}`} m={item.ppp} myName={name} />
                    ) : (
                      <FfttMatchCard key={`fftt-${item.fftt.id}`} m={item.fftt} myName={name} />
                    ),
                  )}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>

        {/* Éditeur d'objectif */}
        <SwipeSheet visible={goalOpen} onClose={() => setGoalOpen(false)} style={styles.sheetPad}>
            <ThemedText type="cardTitle">Mon objectif</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ELO actuel : {elo}
            </ThemedText>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.modalLbl}>
              ELO À ATTEINDRE
            </ThemedText>
            <TextInput
              style={styles.modalInput}
              value={goalEloInput}
              onChangeText={(t) => setGoalEloInput(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="Ex : 2200"
              placeholderTextColor={Palette.grey}
            />

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.modalLbl}>
              AVANT (OPTIONNEL)
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
              {monthOptions.map((iso) => {
                const on = goalMonthIso === iso;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => setGoalMonthIso(on ? null : iso)}
                    style={[styles.monthChip, on ? styles.monthChipOn : styles.monthChipOff]}>
                    <ThemedText type="smallBold" themeColor={on ? 'onBrand' : 'text'} numberOfLines={1}>
                      {monthYearLabel(iso)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable style={styles.modalSave} onPress={saveGoal}>
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            </Pressable>
            {hasGoal ? (
              <Pressable style={styles.modalRemove} onPress={removeGoal}>
                <ThemedText type="smallBold" themeColor="danger">
                  Retirer l&apos;objectif
                </ThemedText>
              </Pressable>
            ) : null}
        </SwipeSheet>

        {/* Éditeur de club */}
        <SwipeSheet visible={clubOpen} onClose={() => setClubOpen(false)} style={styles.sheetPad}>
            <ThemedText type="cardTitle">Mon club</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Choisis le lieu où tu joues le plus souvent. Il sera épinglé sur ta carte.
            </ThemedText>
            <ClubSearch selected={clubDraft} onSelect={setClubDraft} />
            <Pressable style={styles.modalSave} onPress={saveClub}>
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            </Pressable>
        </SwipeSheet>
      </SafeAreaView>
    </View>
  );
}

/** Carte d'un match Ping Pang Paris (score détaillé + delta ELO). */
function PppMatchCard({ m, myName }: { m: MatchView; myName: string }) {
  const sets = parseSetScores(m.setScores);
  return (
    <View style={styles.matchCard}>
      <View style={styles.matchMeta}>
        <View style={[styles.srcBadge, styles.srcPpp]}>
          <ThemedText type="small" themeColor="onBrand" style={styles.srcBadgeTxt}>
            Ping Pang
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textMuted">
          {shortDate(m.date)}
        </ThemedText>
      </View>
      <View style={styles.matchBody}>
        <View style={styles.matchPlayers}>
          <View style={[styles.namePill, m.won ? styles.pillWin : styles.pillLose]}>
            <ThemedText type="small" numberOfLines={1}>
              {myName}
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
            {m.score || '-'}
          </ThemedText>
        )}

        <ThemedText
          type="cardTitle"
          style={[styles.matchDelta, { color: m.delta > 0 ? Palette.evergreen : m.delta < 0 ? Palette.redInk : Palette.grey }]}>
          {m.delta ? `${m.delta > 0 ? '+' : ''}${m.delta}` : '-'}
        </ThemedText>
      </View>
    </View>
  );
}

/** Carte d'un match officiel FFTT (adversaire + classement, V/D, points FFTT). */
function FfttMatchCard({ m, myName }: { m: FfttMatchView; myName: string }) {
  const gain = m.gainPerte;
  return (
    <View style={styles.matchCard}>
      <View style={styles.matchMeta}>
        <View style={[styles.srcBadge, styles.srcFftt]}>
          <ThemedText type="small" themeColor="text" style={styles.srcBadgeTxt}>
            FFTT
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textMuted">
          {m.date ? shortDate(m.date) : m.dateRaw}
        </ThemedText>
      </View>
      <View style={styles.matchBody}>
        <View style={styles.matchPlayers}>
          <View style={[styles.namePill, m.won === false ? styles.pillLose : styles.pillWin]}>
            <ThemedText type="small" numberOfLines={1}>
              {myName}
            </ThemedText>
          </View>
          <View style={[styles.namePill, m.won === false ? styles.pillWin : styles.pillLose]}>
            <ThemedText type="small" numberOfLines={1}>
              {m.opponent}
              {m.opponentRank ? ` · ${m.opponentRank}` : ''}
            </ThemedText>
          </View>
        </View>

        <ThemedText type="subtitle" themeColor={m.won === true ? 'brand' : m.won === false ? 'textMuted' : 'textSecondary'}>
          {m.won === true ? 'V' : m.won === false ? 'D' : '-'}
        </ThemedText>

        <ThemedText
          type="cardTitle"
          style={[styles.matchDelta, { color: gain != null && gain > 0 ? Palette.evergreen : gain != null && gain < 0 ? Palette.redInk : Palette.grey }]}>
          {gain != null ? `${gain > 0 ? '+' : ''}${gain}` : '-'}
        </ThemedText>
      </View>
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
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, flexShrink: 1 },

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
  clubIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  barTrack: { height: 8, borderRadius: Radius.pill, backgroundColor: TRACK, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Palette.evergreen, borderRadius: Radius.pill },

  playedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
  },
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

  empty: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
  },
  list: { gap: Spacing.two },

  matchCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  matchMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  srcBadge: { borderRadius: Radius.xs, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  srcBadgeTxt: { fontSize: 10 },
  srcPpp: { backgroundColor: Palette.evergreen },
  srcFftt: { backgroundColor: Palette.blue, opacity: 0.9 },
  matchBody: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
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

  sheetPad: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  modalLbl: { marginTop: Spacing.two },
  modalInput: {
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 17,
  },
  monthRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  monthChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.xs },
  monthChipOn: { backgroundColor: Palette.evergreen },
  monthChipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  modalSave: {
    marginTop: Spacing.three,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRemove: { alignItems: 'center', padding: Spacing.three },
});
