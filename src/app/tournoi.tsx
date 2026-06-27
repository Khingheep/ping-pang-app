/**
 * Détail d'un tournoi (Événement) — piloté par l'id passé en param.
 *
 * États successifs :
 *   open    → liste des inscrits + code d'invitation ; l'organisateur lance le tournoi.
 *   poules  → classement live de chaque poule (V/D) + matchs à jouer (tap = vainqueur).
 *   bracket → tableau à élimination directe (top 2 de chaque poule), avancement auto.
 *   done    → vainqueur.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SetScoreEntry, type SetInput } from '@/components/set-score-entry';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { countSets, formatSetScores, parseSetScores, validateMatch, type SetScore } from '@/lib/matches/sets';
import {
  computePouleStandings,
  fetchTournamentDetail,
  recordTournamentMatch,
  startTournament,
  TOURNAMENT_FORMATS,
  type TournamentDetail,
  type TournamentMatch,
} from '@/lib/tournaments/tournaments';

function numericSets(sets: SetInput[]): SetScore[] {
  return sets
    .map((s) => ({ a: Number.parseInt(s.a, 10), b: Number.parseInt(s.b, 10) }))
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
}

function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 1) return 'Finale';
  if (fromEnd === 2) return 'Demi-finales';
  if (fromEnd === 3) return 'Quarts de finale';
  return `Tour ${round + 1}`;
}

export default function TournoiScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<TournamentMatch | null>(null);
  const [sets, setSets] = useState<SetInput[]>([]);

  const load = useCallback(() => {
    if (id) fetchTournamentDetail(id).then(setDetail);
  }, [id]);

  useFocusEffect(load);

  if (!detail) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Palette.evergreen} />
      </View>
    );
  }

  const { tournament, players, matches } = detail;
  const isOwner = tournament.owner_id === myId;
  const nameOf = (pid: string | null) => players.find((p) => p.player_id === pid)?.name ?? '—';

  async function launch() {
    try {
      setBusy(true);
      await startTournament(detail!);
      load();
    } catch (e) {
      Alert.alert('Impossible de lancer', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  const bestOf = TOURNAMENT_FORMATS[tournament.format]?.bestOf ?? 5;

  function openScore(m: TournamentMatch) {
    if (!m.player_a || !m.player_b) return; // bye / slot vide
    const existing = parseSetScores(m.set_scores).map((s) => ({ a: String(s.a), b: String(s.b) }));
    setSets(existing.length ? existing : Array.from({ length: Math.ceil(bestOf / 2) }, () => ({ a: '', b: '' })));
    setScoring(m);
  }

  async function submitScore() {
    if (!scoring) return;
    const valid = validateMatch(numericSets(sets), bestOf);
    if (!valid.ok) {
      Alert.alert('Score invalide', valid.error ?? 'Vérifie les manches.');
      return;
    }
    const counts = countSets(numericSets(sets));
    const winnerId = counts.a > counts.b ? scoring.player_a : scoring.player_b;
    if (!winnerId) return;
    try {
      setBusy(true);
      await recordTournamentMatch(tournament.id, scoring.id, winnerId, `${counts.a}-${counts.b}`, formatSetScores(numericSets(sets)) || null);
      setScoring(null);
      load();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  function shareCode() {
    Share.share({ message: `Rejoins mon tournoi « ${tournament.name} » sur Ping Pang : code ${tournament.code}` }).catch(() => {});
  }

  const poules = [...new Set(players.map((p) => p.poule).filter((x): x is string => !!x))].sort();
  const bracketMatches = matches.filter((m) => m.phase === 'bracket');
  const bracketRounds = [...new Set(bracketMatches.map((m) => m.round ?? 0))].sort((a, b) => a - b);
  const finalMatch = bracketMatches.find((m) => (m.round ?? 0) === Math.max(0, ...bracketRounds) && bracketRounds.length);
  const champion = tournament.status === 'done' && finalMatch?.winner ? nameOf(finalMatch.winner) : null;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
            {tournament.name}
          </ThemedText>
          <Pressable onPress={shareCode} hitSlop={12}>
            <Ionicons name="share-outline" size={22} color={Palette.onyx} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Bandeau code + format */}
          <Pressable style={styles.codeCard} onPress={shareCode}>
            <View>
              <ThemedText type="small" style={{ color: Palette.lime }}>
                CODE D’INVITATION
              </ThemedText>
              <ThemedText type="title" themeColor="onBrand" style={styles.codeText}>
                {tournament.code}
              </ThemedText>
            </View>
            <View style={styles.codeMeta}>
              <ThemedText type="smallBold" themeColor="onBrand">
                {TOURNAMENT_FORMATS[tournament.format]?.label ?? tournament.format}
              </ThemedText>
              <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.8 }}>
                {players.length}/{tournament.max_players} joueurs
              </ThemedText>
              {tournament.is_ranked ? (
                <ThemedText type="small" style={{ color: Palette.lime }}>
                  Classé
                </ThemedText>
              ) : null}
            </View>
          </Pressable>

          {champion ? (
            <View style={styles.championCard}>
              <ThemedText type="label" themeColor="textSecondary">
                🏆 VAINQUEUR
              </ThemedText>
              <Avatar name={champion} size={72} color={Palette.lime} />
              <ThemedText type="title">{champion}</ThemedText>
            </View>
          ) : null}

          {/* ───────── Inscriptions ───────── */}
          {tournament.status === 'open' ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Inscrits ({players.length})
              </ThemedText>
              <View style={styles.list}>
                {players.map((p) => (
                  <View key={p.player_id} style={styles.row}>
                    <Avatar name={p.name} size={40} />
                    <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                      {p.name} {p.player_id === tournament.owner_id ? '· organisateur' : ''}
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {p.elo}
                    </ThemedText>
                  </View>
                ))}
              </View>
              {isOwner ? (
                <Pressable style={[styles.cta, (busy || players.length < 2) && { opacity: 0.5 }]} disabled={busy || players.length < 2} onPress={launch}>
                  <ThemedText type="cardTitle" themeColor="onBrand">
                    Lancer le tournoi ({players.length} joueurs)
                  </ThemedText>
                </Pressable>
              ) : (
                <View style={styles.empty}>
                  <ThemedText type="default" themeColor="textSecondary">
                    En attente du lancement par l’organisateur.
                  </ThemedText>
                </View>
              )}
            </>
          ) : null}

          {/* ───────── Poules ───────── */}
          {tournament.status === 'poules' || (tournament.status === 'bracket' && poules.length) ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Poules
              </ThemedText>
              {poules.map((poule) => {
                const standings = computePouleStandings(players, matches, poule);
                const pouleMatches = matches.filter((m) => m.phase === 'poule' && m.poule === poule);
                return (
                  <View key={poule} style={styles.pouleCard}>
                    <ThemedText type="cardTitle" style={styles.pouleTitle}>
                      Poule {poule}
                    </ThemedText>
                    {standings.map((s, i) => (
                      <View key={s.playerId} style={styles.standRow}>
                        <ThemedText type="smallBold" themeColor={i < 2 ? 'brand' : 'textSecondary'} style={styles.standRank}>
                          {i + 1}
                        </ThemedText>
                        <ThemedText type="default" style={{ flex: 1 }} numberOfLines={1}>
                          {s.name}
                        </ThemedText>
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          {s.wins}V {s.losses}D
                        </ThemedText>
                      </View>
                    ))}

                    {tournament.status === 'poules' ? (
                      <View style={styles.pouleMatches}>
                        {pouleMatches.map((m) => (
                          <MatchRow key={m.id} m={m} nameOf={nameOf} onOpen={openScore} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}

          {/* ───────── Bracket ───────── */}
          {bracketRounds.length ? (
            <>
              <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                Phase finale
              </ThemedText>
              {bracketRounds.map((r) => (
                <View key={r} style={styles.roundBlock}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.roundLbl}>
                    {roundName(r, bracketRounds.length)}
                  </ThemedText>
                  {bracketMatches
                    .filter((m) => (m.round ?? 0) === r)
                    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
                    .map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} onOpen={openScore} />
                    ))}
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>

        <Modal visible={!!scoring} transparent animationType="slide" onRequestClose={() => setScoring(null)}>
          <View style={styles.modalRoot}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <ThemedText type="cardTitle">Score du match</ThemedText>
                <Pressable onPress={() => setScoring(null)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={Palette.onyx} />
                </Pressable>
              </View>
              {scoring ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.modalSub}>
                    {nameOf(scoring.player_a)} vs {nameOf(scoring.player_b)}
                  </ThemedText>
                  <SetScoreEntry
                    value={sets}
                    onChange={setSets}
                    bestOf={bestOf}
                    meLabel={nameOf(scoring.player_a)}
                    oppLabel={nameOf(scoring.player_b)}
                  />
                  <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={submitScore}>
                    {busy ? (
                      <ActivityIndicator color={Palette.whitePP} />
                    ) : (
                      <ThemedText type="cardTitle" themeColor="onBrand">
                        Valider le score
                      </ThemedText>
                    )}
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

/** Carte d'un match : tap = ouvre la saisie du score par manche. Affiche le détail si joué. */
function MatchRow({
  m,
  nameOf,
  onOpen,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  onOpen: (m: TournamentMatch) => void;
}) {
  const decided = !!m.winner;
  const canScore = !!m.player_a && !!m.player_b;
  const setsWon = (m.score ?? '0-0').split('-');
  const detail = parseSetScores(m.set_scores);
  return (
    <Pressable disabled={!canScore} onPress={() => onOpen(m)} style={styles.matchCard}>
      {[m.player_a, m.player_b].map((pid, i) => {
        const isWinner = decided && m.winner === pid;
        return (
          <View key={i} style={[styles.slot, isWinner && styles.slotWin, i === 0 && styles.slotDivider]}>
            <ThemedText type="cardTitle" themeColor={isWinner ? 'brand' : 'text'} numberOfLines={1} style={{ flex: 1 }}>
              {nameOf(pid)}
            </ThemedText>
            {decided ? (
              <ThemedText type="subtitle" themeColor={isWinner ? 'brand' : 'textMuted'}>
                {setsWon[i] ?? '0'}
              </ThemedText>
            ) : null}
            {isWinner ? <Ionicons name="checkmark" size={18} color={Palette.evergreen} /> : null}
          </View>
        );
      })}
      <View style={styles.matchFoot}>
        {decided && detail.length ? (
          <ThemedText type="small" themeColor="textMuted">
            {detail.map((s) => `${s.a}-${s.b}`).join('   ')}
          </ThemedText>
        ) : canScore ? (
          <ThemedText type="smallBold" themeColor="brand">
            Saisir le score
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textMuted">
            En attente du tour précédent
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },

  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.evergreen,
    borderRadius: Radius.md,
    padding: Spacing.four,
    marginTop: Spacing.two,
  },
  codeText: { letterSpacing: 4, marginTop: Spacing.half },
  codeMeta: { alignItems: 'flex-end', gap: Spacing.half },

  championCard: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four, paddingVertical: Spacing.four },

  section: { marginTop: Spacing.four, marginBottom: Spacing.two },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  empty: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border, borderRadius: Radius.sm, padding: Spacing.four, marginTop: Spacing.two },

  pouleCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  pouleTitle: { marginBottom: Spacing.two },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  standRank: { width: 18 },
  pouleMatches: { marginTop: Spacing.three, gap: Spacing.two },

  roundBlock: { marginBottom: Spacing.two },
  roundLbl: { marginTop: Spacing.two, marginBottom: Spacing.one },

  matchCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  slotDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.border },
  slotWin: { backgroundColor: Palette.lime },
  matchFoot: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
    backgroundColor: Palette.whitePP,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,16,16,0.45)' },
  modalCard: {
    backgroundColor: Palette.whitePP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalSub: { marginBottom: Spacing.three },
  cta: {
    marginTop: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
