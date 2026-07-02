/**
 * Détail d'un tournoi (Événement) - piloté par l'id passé en param.
 *
 * États successifs :
 *   open    → liste des inscrits + code d'invitation ; l'organisateur lance le tournoi.
 *   poules  → classement live de chaque poule (V/D) + matchs à jouer (tap = vainqueur).
 *   bracket → tableau à élimination directe (top 2 de chaque poule), avancement auto.
 *   done    → vainqueur.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SetScoreEntry, type SetInput } from '@/components/set-score-entry';
import { SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { countSets, formatSetScores, parseSetScores, validateMatch, type SetScore } from '@/lib/matches/sets';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/players/profile';
import { confirm, notify } from '@/lib/ui/alert';
import {
  addPlayersToTournament,
  computeFinalRanking,
  computePlayerRecords,
  computePouleStandings,
  fetchTournamentDetail,
  type FinalRankEntry,
  forfeitPlayerInPoule,
  recordTournamentForfeit,
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
  const [matchDetail, setMatchDetail] = useState<TournamentMatch | null>(null);
  const [sets, setSets] = useState<SetInput[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [candidates, setCandidates] = useState<LeaderboardEntry[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [openPoules, setOpenPoules] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'poules' | 'finale'>('poules');
  const [showJourney, setShowJourney] = useState(false); // tournoi fini : révéler poules+tableau

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
  const records = computePlayerRecords(matches); // bilan V/D global (vue Participants)
  const nameOf = (pid: string | null) => players.find((p) => p.player_id === pid)?.name ?? '-';
  const avatarOf = (pid: string | null) => players.find((p) => p.player_id === pid)?.avatar ?? null;
  const goPlayer = (pid: string) => router.push({ pathname: '/player', params: { id: pid } });
  // Tournoi terminé → on met le CLASSEMENT en avant et on masque poules/tableau (révélables au besoin).
  const reviewOpen = tournament.status !== 'done' || showJourney;
  // Tap sur un match (poule ou tableau) → détail lisible par TOUS ; la saisie du score y est
  // proposée seulement à qui en a le droit (organisateur / joueurs du match).
  const openDetail = (m: TournamentMatch) => {
    if (m.player_a && m.player_b) setMatchDetail(m);
  };
  // Qui peut saisir un score : l'organisateur (tous les matchs) ou un des 2 joueurs du match (le sien).
  const mayScore = (m: TournamentMatch) =>
    !!m.player_a && !!m.player_b && (isOwner || m.player_a === myId || m.player_b === myId);

  async function launch() {
    try {
      setBusy(true);
      await startTournament(detail!);
      load();
    } catch (e) {
      notify('Impossible de lancer', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  const bestOf = TOURNAMENT_FORMATS[tournament.format]?.bestOf ?? 5;

  async function openAddPlayers() {
    setPicked({});
    setAddOpen(true);
    const all = await fetchLeaderboard(200);
    const already = new Set(players.map((p) => p.player_id));
    setCandidates(all.filter((p) => !already.has(p.id)));
  }

  async function confirmAddPlayers() {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (!ids.length) return setAddOpen(false);
    try {
      setBusy(true);
      await addPlayersToTournament(tournament.id, ids);
      setAddOpen(false);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

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
      notify('Score invalide', valid.error ?? 'Vérifie les manches.');
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
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  // Forfait sur le match en cours de saisie : le joueur `absentId` est déclaré forfait, l'autre gagne 3-0.
  async function submitForfeit(absentId: string) {
    if (!scoring) return;
    const presentId = scoring.player_a === absentId ? scoring.player_b : scoring.player_a;
    if (!presentId) return;
    if (
      !(await confirm({
        title: 'Déclarer forfait ?',
        message: `${nameOf(absentId)} est forfait : ${nameOf(presentId)} gagne le match 3-0.`,
        confirmText: 'Forfait',
        destructive: true,
      }))
    )
      return;
    try {
      setBusy(true);
      await recordTournamentForfeit(tournament.id, scoring, presentId, bestOf);
      setScoring(null);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  // Joueur absent : forfait sur TOUS ses matchs de poule restants (chaque adversaire gagne 3-0).
  async function forfeitWholePoule(playerId: string) {
    if (
      !(await confirm({
        title: 'Joueur absent ?',
        message: `${nameOf(playerId)} est déclaré forfait pour tous ses matchs de poule restants.`,
        confirmText: 'Déclarer forfait',
        destructive: true,
      }))
    )
      return;
    try {
      setBusy(true);
      await forfeitPlayerInPoule(detail!, playerId, bestOf);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
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
  // Classement final (podium + liste), calculé seulement quand le tournoi est terminé.
  const ranking = tournament.status === 'done' ? computeFinalRanking(players, matches) : [];

  // Poules et phase finale sur des « pages » distinctes (onglets) pour ne pas tout mélanger.
  const hasBracket = bracketRounds.length > 0;
  const hasPoulesView = poules.length > 0 && tournament.status !== 'open';
  const showTabs = hasBracket && hasPoulesView;
  const activeTab: 'poules' | 'finale' = showTabs ? tab : hasBracket ? 'finale' : 'poules';

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
          <Pressable onPress={() => setParticipantsOpen(true)} hitSlop={12}>
            <Ionicons name="people-outline" size={23} color={Palette.onyx} />
          </Pressable>
          <Pressable onPress={shareCode} hitSlop={12}>
            <Ionicons name="share-outline" size={22} color={Palette.onyx} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Bandeau code d'invitation — UNIQUEMENT en phase inscriptions (une fois lancé, plus
              personne ne rejoint → le code ne sert à rien). Ensuite : bandeau compact format/joueurs. */}
          {tournament.status === 'open' ? (
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
          ) : (
            <View style={styles.metaStrip}>
              <ThemedText type="smallBold" themeColor="brand">
                {TOURNAMENT_FORMATS[tournament.format]?.label ?? tournament.format}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                · {players.length} joueurs{tournament.is_ranked ? ' · Classé' : ''}
              </ThemedText>
            </View>
          )}

          {/* Fil d'étapes uniquement quand il n'y a PAS d'onglets (sinon doublon avec Poules/Phase finale). */}
          {!showTabs ? <PhaseStepper status={tournament.status} hasPoules={poules.length > 0} /> : null}

          {/* Tournoi terminé → classement final : podium (top 3) + reste du classement. */}
          {tournament.status === 'done' && ranking.length ? (
            <View style={styles.classement}>
              <ThemedText type="label" themeColor="textSecondary" style={styles.classementTitle}>
                🏆 CLASSEMENT FINAL
              </ThemedText>
              <Podium top3={ranking.slice(0, 3)} avatarOf={avatarOf} onPlayer={goPlayer} />
              {ranking.length > 3 ? (
                <View style={styles.rankList}>
                  {ranking.slice(3).map((r) => (
                    <Pressable key={r.playerId} style={styles.rankRow} onPress={() => goPlayer(r.playerId)}>
                      <ThemedText type="cardTitle" themeColor="textMuted" style={styles.rankNum}>
                        {r.place}
                      </ThemedText>
                      <Avatar name={r.name} uri={avatarOf(r.playerId)} size={34} />
                      <ThemedText type="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                        {r.name}
                      </ThemedText>
                      <Ionicons name="chevron-forward" size={16} color={Palette.grey} />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* Le parcours (poules + tableau) est masqué par défaut une fois le tournoi fini. */}
              <Pressable style={styles.reviewToggle} onPress={() => setShowJourney((v) => !v)} hitSlop={6}>
                <ThemedText type="smallBold" themeColor="brand">
                  {showJourney ? 'Masquer le parcours' : 'Revoir le parcours (poules & tableau)'}
                </ThemedText>
                <Ionicons name={showJourney ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.evergreen} />
              </Pressable>
            </View>
          ) : null}

          {/* Qui saisit les scores : rappel du modèle de droits (orga = tout, joueur = ses matchs). */}
          {tournament.status === 'poules' || tournament.status === 'bracket' ? (
            <View style={styles.permHint}>
              <Ionicons name={isOwner ? 'shield-checkmark' : 'information-circle-outline'} size={16} color={Palette.evergreen} />
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {isOwner
                  ? 'Organisateur : tu peux saisir le score de tous les matchs.'
                  : 'Tu peux saisir le score de tes propres matchs ; l’organisateur gère les autres.'}
              </ThemedText>
            </View>
          ) : null}

          {/* ───────── Inscriptions ───────── */}
          {tournament.status === 'open' ? (
            <>
              <View style={styles.sectionRow}>
                <ThemedText type="sectionTitle" themeColor="textSecondary">
                  Inscrits ({players.length}/{tournament.max_players})
                </ThemedText>
                {isOwner && players.length < tournament.max_players ? (
                  <Pressable style={styles.addBtn} onPress={openAddPlayers}>
                    <Ionicons name="person-add" size={16} color={Palette.evergreen} />
                    <ThemedText type="smallBold" themeColor="brand">
                      Ajouter
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.list}>
                {players.map((p) => (
                  <View key={p.player_id} style={styles.row}>
                    <Avatar name={p.name} size={40} uri={p.avatar} />
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

          {/* Onglets Poules / Phase finale (une fois le tableau final généré). */}
          {showTabs && reviewOpen ? (
            <View style={styles.tabs}>
              {(['poules', 'finale'] as const).map((t) => {
                const on = activeTab === t;
                return (
                  <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, on && styles.tabOn]}>
                    <ThemedText type="smallBold" themeColor={on ? 'onBrand' : 'textSecondary'}>
                      {t === 'poules' ? 'Poules' : 'Phase finale'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* ───────── Poules ───────── */}
          {hasPoulesView && activeTab === 'poules' && reviewOpen ? (
            <>
              {!showTabs ? (
                <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                  Poules
                </ThemedText>
              ) : null}
              {poules.map((poule) => {
                const standings = computePouleStandings(players, matches, poule);
                const pouleMatches = matches
                  .filter((m) => m.phase === 'poule' && m.poule === poule)
                  .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
                // Les 2 premiers ne sont « Qualifiés » qu'une fois la poule terminée (ou en phase finale) :
                // tant qu'aucun match n'est joué, le classement n'est que l'ordre des têtes de série.
                const pouleDone = pouleMatches.length > 0 && pouleMatches.every((m) => m.winner);
                const decided = tournament.status === 'bracket' || pouleDone;
                const nQual = tournament.qualifiers_per_poule ?? 2;
                return (
                  <View key={poule} style={styles.pouleCard}>
                    <View style={styles.pouleTitleRow}>
                      <ThemedText type="cardTitle">Poule {poule}</ThemedText>
                      {!decided ? (
                        <ThemedText type="small" themeColor="textMuted">
                          {nQual === 1 ? '1er qualifié' : `Top ${nQual} qualifiés`}
                        </ThemedText>
                      ) : null}
                    </View>
                    {/* En-tête de colonnes du classement. */}
                    <View style={styles.standHead}>
                      <ThemedText type="small" themeColor="textMuted" style={styles.standRank}>
                        #
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={{ flex: 1 }}>
                        Joueur
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={styles.statCell}>
                        J
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={styles.statCell}>
                        V
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={styles.statCell}>
                        D
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={styles.setCell}>
                        Sets
                      </ThemedText>
                      {isOwner && tournament.status === 'poules' ? <View style={styles.forfeitIcon} /> : null}
                    </View>
                    {standings.map((s, i) => {
                      const qualified = decided && i < nQual;
                      const setDiff = s.setsWon - s.setsLost;
                      const hasPending =
                        tournament.status === 'poules' &&
                        pouleMatches.some((m) => !m.winner && (m.player_a === s.playerId || m.player_b === s.playerId));
                      return (
                      <View key={s.playerId} style={[styles.standRow, qualified && styles.standRowQ]}>
                        <ThemedText type="smallBold" themeColor={qualified ? 'brand' : 'textSecondary'} style={styles.standRank}>
                          {i + 1}
                        </ThemedText>
                        <View style={styles.standName}>
                          <ThemedText type="default" numberOfLines={1} style={styles.standNameText}>
                            {s.name}
                          </ThemedText>
                          {qualified ? (
                            <View style={styles.qBadge}>
                              <ThemedText type="small" themeColor="brand">
                                Qualifié
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                        <ThemedText type="small" themeColor="textMuted" style={styles.statCell}>
                          {s.played}
                        </ThemedText>
                        <ThemedText type="smallBold" themeColor={qualified ? 'brand' : 'text'} style={styles.statCell}>
                          {s.wins}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.statCell}>
                          {s.losses}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.setCell}>
                          {s.setsWon}-{s.setsLost}
                          {s.played > 0 ? (
                            <ThemedText type="small" themeColor="textMuted">
                              {' '}
                              ({setDiff >= 0 ? '+' : ''}
                              {setDiff})
                            </ThemedText>
                          ) : null}
                        </ThemedText>
                        {isOwner && tournament.status === 'poules' ? (
                          hasPending ? (
                            <Pressable onPress={() => forfeitWholePoule(s.playerId)} hitSlop={8} style={styles.forfeitIcon}>
                              <Ionicons name="person-remove-outline" size={15} color={Palette.grey} />
                            </Pressable>
                          ) : (
                            <View style={styles.forfeitIcon} />
                          )
                        ) : null}
                      </View>
                      );
                    })}

                    {tournament.status === 'poules' && pouleMatches.length ? (
                      <>
                        <Pressable
                          style={styles.pouleToggle}
                          onPress={() => setOpenPoules((s) => ({ ...s, [poule]: !s[poule] }))}
                          hitSlop={8}>
                          <ThemedText type="smallBold" themeColor="brand">
                            {openPoules[poule]
                              ? 'Masquer les matchs'
                              : `Voir les matchs (${pouleMatches.filter((m) => m.winner).length}/${pouleMatches.length})`}
                          </ThemedText>
                          <Ionicons
                            name={openPoules[poule] ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={Palette.evergreen}
                          />
                        </Pressable>
                        {openPoules[poule] ? (
                          <View style={styles.pouleMatches}>
                            {pouleMatches.map((m) => (
                              <MatchRow key={m.id} m={m} nameOf={nameOf} onOpen={openDetail} canScore={mayScore(m)} />
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}

          {/* ───────── Bracket (les « branches » qui apparaissent à la fin des poules) ───────── */}
          {hasBracket && activeTab === 'finale' && reviewOpen ? (
            <>
              <View style={styles.section}>
                {!showTabs ? (
                  <ThemedText type="sectionTitle" themeColor="textSecondary">
                    Phase finale
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textMuted">
                  Tableau à élimination directe - glisse pour voir tous les tours.
                </ThemedText>
              </View>
              <BracketTree
                rounds={bracketRounds}
                matches={bracketMatches}
                nameOf={nameOf}
                onOpen={openDetail}
                canScore={mayScore}
              />
            </>
          ) : null}
        </ScrollView>

        <SwipeSheet visible={!!scoring} onClose={() => setScoring(null)} style={styles.modalCard}>
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
              {/* Forfait (bouton destructif rouge) : l'organisateur peut déclarer forfait l'un OU
                  l'autre joueur ; un joueur ne peut déclarer QUE lui-même forfait (l'autre gagne 3-0). */}
              <View style={styles.forfeitRow}>
                {[scoring.player_a, scoring.player_b]
                  .filter((pid): pid is string => !!pid && (isOwner || pid === myId))
                  .map((pid) => (
                    <Pressable key={pid} disabled={busy} style={styles.forfeitBtn} onPress={() => submitForfeit(pid)}>
                      <Ionicons name="flag-outline" size={14} color={Palette.redInk} />
                      <ThemedText type="smallBold" style={styles.forfeitText}>
                        {pid === myId ? 'Me déclarer forfait' : `Forfait ${nameOf(pid)}`}
                      </ThemedText>
                    </Pressable>
                  ))}
              </View>
            </>
          ) : null}
        </SwipeSheet>

        {/* Détail d'un match : lisible par TOUS ; le bouton de saisie n'apparaît que si autorisé. */}
        <SwipeSheet visible={!!matchDetail} onClose={() => setMatchDetail(null)} style={styles.modalCard}>
          {matchDetail ? (
            <>
              <View style={styles.modalHead}>
                <ThemedText type="cardTitle">Détail du match</ThemedText>
                <Pressable onPress={() => setMatchDetail(null)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={Palette.onyx} />
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textMuted" style={styles.modalSub}>
                {matchDetail.phase === 'poule'
                  ? `Poule ${matchDetail.poule}`
                  : roundName(matchDetail.round ?? 0, Math.max(1, bracketRounds.length))}{' '}
                · Bo{bestOf}
              </ThemedText>

              {[matchDetail.player_a, matchDetail.player_b].map((pid, i) => {
                const isWinner = !!matchDetail.winner && matchDetail.winner === pid;
                const setsWon = (matchDetail.score ?? '0-0').split('-');
                return (
                  <View key={i} style={[styles.detailPlayer, isWinner && styles.detailPlayerWin]}>
                    <Avatar name={nameOf(pid)} uri={avatarOf(pid)} size={40} />
                    <ThemedText type="cardTitle" numberOfLines={1} themeColor={isWinner ? 'brand' : 'text'} style={{ flex: 1 }}>
                      {nameOf(pid)}
                    </ThemedText>
                    {isWinner ? <Ionicons name="trophy" size={16} color={Palette.evergreen} /> : null}
                    {matchDetail.winner ? (
                      <ThemedText type="subtitle" themeColor={isWinner ? 'brand' : 'textMuted'}>
                        {setsWon[i] ?? '0'}
                      </ThemedText>
                    ) : null}
                  </View>
                );
              })}

              <View style={styles.detailSets}>
                {(() => {
                  const detailSets = parseSetScores(matchDetail.set_scores);
                  return detailSets.length ? (
                    <>
                      <ThemedText type="small" themeColor="textSecondary">
                        Manches
                      </ThemedText>
                      <ThemedText type="cardTitle">{detailSets.map((s) => `${s.a}-${s.b}`).join('   ')}</ThemedText>
                    </>
                  ) : (
                    <ThemedText type="small" themeColor="textMuted">
                      Match pas encore joué.
                    </ThemedText>
                  );
                })()}
              </View>

              {mayScore(matchDetail) ? (
                <Pressable
                  style={styles.cta}
                  onPress={() => {
                    const m = matchDetail;
                    setMatchDetail(null);
                    openScore(m);
                  }}>
                  <ThemedText type="cardTitle" themeColor="onBrand">
                    {matchDetail.winner ? 'Modifier le score' : 'Saisir le score'}
                  </ThemedText>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </SwipeSheet>

        {/* Ajouter des joueurs (organisateur) */}
        <SwipeSheet visible={addOpen} onClose={() => setAddOpen(false)} style={[styles.modalCard, styles.addCard]}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Ajouter des joueurs</ThemedText>
            <Pressable onPress={() => setAddOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          <ScrollView style={styles.addList} keyboardShouldPersistTaps="handled">
            {candidates.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary" style={{ paddingVertical: Spacing.three }}>
                Aucun autre joueur à ajouter.
              </ThemedText>
            ) : (
              candidates.map((c) => {
                const on = !!picked[c.id];
                const full = players.length + Object.values(picked).filter(Boolean).length >= tournament.max_players;
                return (
                  <Pressable
                    key={c.id}
                    disabled={!on && full}
                    onPress={() => setPicked((s) => ({ ...s, [c.id]: !s[c.id] }))}
                    style={[styles.addRow, (!on && full) && { opacity: 0.4 }]}>
                    <Avatar name={c.display_name} size={36} />
                    <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                      {c.display_name}
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {c.elo}
                    </ThemedText>
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={on ? Palette.evergreen : Palette.border}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={confirmAddPlayers}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                Ajouter ({Object.values(picked).filter(Boolean).length})
              </ThemedText>
            )}
          </Pressable>
        </SwipeSheet>

        {/* Vue Participants : roster complet (rang, club, classement, poule, bilan V/D). */}
        <SwipeSheet visible={participantsOpen} onClose={() => setParticipantsOpen(false)} style={[styles.modalCard, styles.addCard]}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Participants ({players.length})</ThemedText>
            <Pressable onPress={() => setParticipantsOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          <ScrollView style={styles.addList} showsVerticalScrollIndicator={false}>
            {players.map((p, i) => {
              const rec = records.get(p.player_id);
              const isOrga = p.player_id === tournament.owner_id;
              return (
                <Pressable
                  key={p.player_id}
                  style={styles.partRow}
                  onPress={() => {
                    setParticipantsOpen(false);
                    router.push({ pathname: '/player', params: { id: p.player_id } });
                  }}>
                  <ThemedText type="smallBold" themeColor="textMuted" style={styles.partRank}>
                    {p.seed ?? i + 1}
                  </ThemedText>
                  <Avatar name={p.name} size={40} uri={p.avatar} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.partNameRow}>
                      <ThemedText type="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {p.name}
                      </ThemedText>
                      {isOrga ? (
                        <View style={styles.orgaBadge}>
                          <Ionicons name="shield-checkmark" size={11} color={Palette.evergreen} />
                          <ThemedText type="small" themeColor="brand">
                            Orga
                          </ThemedText>
                        </View>
                      ) : null}
                      {p.poule ? (
                        <View style={styles.poulePill}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Poule {p.poule}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                      {p.club ? `${p.club} · ` : ''}
                      {p.ranking != null ? `${p.ranking} pts FFTT` : `ELO ${p.elo}`}
                    </ThemedText>
                  </View>
                  {rec && rec.played > 0 ? (
                    <View style={styles.partRecord}>
                      <ThemedText type="smallBold" themeColor="brand">
                        {rec.wins}V
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {rec.losses}D
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textMuted">
                      —
                    </ThemedText>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={Palette.grey} />
                </Pressable>
              );
            })}
          </ScrollView>
        </SwipeSheet>
      </SafeAreaView>
    </View>
  );
}

/** Carte d'un match : tap = ouvre la saisie du score par manche. Affiche le détail si joué. */
function MatchRow({
  m,
  nameOf,
  onOpen,
  canScore,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  onOpen: (m: TournamentMatch) => void;
  canScore: boolean;
}) {
  const decided = !!m.winner;
  const hasBoth = !!m.player_a && !!m.player_b;
  const setsWon = (m.score ?? '0-0').split('-');
  const detail = parseSetScores(m.set_scores);
  return (
    <Pressable disabled={!hasBoth} onPress={() => onOpen(m)} style={styles.matchCard}>
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
        ) : hasBoth ? (
          <ThemedText type="small" themeColor="textMuted">
            {decided ? 'Joué' : 'À jouer'}
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

/** Podium du classement final : 2e à gauche, 1er au centre (plus haut), 3e à droite. Tap → profil. */
function Podium({
  top3,
  avatarOf,
  onPlayer,
}: {
  top3: FinalRankEntry[];
  avatarOf: (id: string | null) => string | null;
  onPlayer: (id: string) => void;
}) {
  const [first, second, third] = top3;
  const col = (e: FinalRankEntry | undefined, place: number, h: number, color: string) => (
    <Pressable key={place} style={styles.podCol} disabled={!e} onPress={() => e && onPlayer(e.playerId)}>
      {e ? (
        <>
          <Avatar name={e.name} uri={avatarOf(e.playerId)} size={place === 1 ? 60 : 48} color={color} />
          <ThemedText type="smallBold" numberOfLines={1} style={styles.podName}>
            {e.name}
          </ThemedText>
          <View style={[styles.podBar, { height: h, backgroundColor: color }]}>
            <ThemedText type="title" style={styles.podPlace}>
              {place}
            </ThemedText>
          </View>
        </>
      ) : null}
    </Pressable>
  );
  return (
    <View style={styles.podium}>
      {col(second, 2, 56, Palette.blue)}
      {col(first, 1, 88, Palette.lime)}
      {col(third, 3, 40, Palette.purple)}
    </View>
  );
}

/** Fil d'avancement du tournoi : Inscriptions → Poules → Phase finale. */
function PhaseStepper({ status, hasPoules }: { status: string; hasPoules: boolean }) {
  const steps = ['Inscriptions', 'Poules', 'Phase finale'];
  const idx = status === 'open' ? 0 : status === 'poules' ? 1 : 2;
  // Petit tournoi sans poules : on saute l'étape « Poules » visuellement.
  return (
    <View style={styles.stepper}>
      {steps.map((label, i) => {
        const done = i < idx;
        const current = i === idx;
        const skipped = i === 1 && !hasPoules && idx >= 2;
        return (
          <Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, (done || current) && styles.stepDotOn, current && styles.stepDotCurrent]}>
                {done || skipped ? (
                  <Ionicons name="checkmark" size={13} color={current ? Palette.whitePP : Palette.evergreen} />
                ) : (
                  <ThemedText type="small" themeColor={current ? 'onBrand' : 'textMuted'}>
                    {i + 1}
                  </ThemedText>
                )}
              </View>
              <ThemedText type="small" themeColor={current ? 'text' : 'textMuted'} style={styles.stepLbl} numberOfLines={1}>
                {label}
              </ThemedText>
            </View>
            {i < steps.length - 1 ? <View style={[styles.stepBar, i < idx && styles.stepBarOn]} /> : null}
          </Fragment>
        );
      })}
    </View>
  );
}

// Dimensions du tableau (bracket).
const CARD_W = 160;
const SLOT_H = 30; // hauteur d'un slot joueur (la carte = 2 slots)
const CARD_H = SLOT_H * 2;
const ROW_PITCH = 86; // pas vertical entre deux matchs du 1er tour
const CONNECTOR_W = 28; // gouttière où sont tracées les branches
const LABEL_H = 30;
const LINE = 1.5;

/**
 * Tableau à élimination directe, défilable horizontalement, avec branches.
 *
 * Robuste pour N'IMPORTE QUEL nombre de poules (3, 5, 6, 7…) : on ne se repose pas
 * sur un flex « parfait » en puissances de 2. Le centre vertical de chaque match est
 * calculé depuis ses deux enfants (slots 2i et 2i+1 du tour précédent), et les cartes
 * sont positionnées en absolu. Les branches sont tracées entre ces centres.
 */
function BracketTree({
  rounds,
  matches,
  nameOf,
  onOpen,
  canScore,
}: {
  rounds: number[];
  matches: TournamentMatch[];
  nameOf: (id: string | null) => string;
  onOpen: (m: TournamentMatch) => void;
  canScore: (m: TournamentMatch) => boolean;
}) {
  const byRound = rounds.map((r) =>
    matches.filter((m) => (m.round ?? 0) === r).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
  );
  const round0Count = Math.max(1, byRound[0]?.length ?? 1);
  const treeH = round0Count * ROW_PITCH;

  // Centre vertical (y) de chaque match, par tour. 1er tour : régulier. Tours suivants :
  // moyenne des centres des deux enfants (alignement exact, byes compris).
  const centers: number[][] = [];
  rounds.forEach((_, ri) => {
    const count = byRound[ri].length;
    if (ri === 0) {
      centers[ri] = Array.from({ length: count }, (_, i) => (i + 0.5) * ROW_PITCH);
    } else {
      centers[ri] = Array.from({ length: count }, (_, i) => {
        const up = centers[ri - 1][2 * i];
        const lo = centers[ri - 1][2 * i + 1];
        if (up == null) return (i + 0.5) * ROW_PITCH;
        return lo == null ? up : (up + lo) / 2;
      });
    }
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.treeScroll}>
      <View style={styles.treeRow}>
        {rounds.map((r, ri) => {
          const colW = ri === 0 ? CARD_W : CARD_W + CONNECTOR_W;
          const cardLeft = ri === 0 ? 0 : CONNECTOR_W;
          return (
            <View key={r} style={{ width: colW }}>
              <View style={styles.treeColHead}>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {roundName(r, rounds.length)}
                </ThemedText>
              </View>
              <View style={{ height: treeH }}>
                {byRound[ri].map((m, i) => {
                  const c = centers[ri][i];
                  const up = ri > 0 ? centers[ri - 1][2 * i] : undefined;
                  const lo = ri > 0 ? centers[ri - 1][2 * i + 1] : undefined;
                  return (
                    <Fragment key={m.id}>
                      {ri > 0 ? <Branches center={c} up={up} lo={lo} /> : null}
                      <View style={[styles.cardPos, { top: c - CARD_H / 2, left: cardLeft }]}>
                        <BracketCard m={m} nameOf={nameOf} onOpen={onOpen} canScore={canScore(m)} />
                      </View>
                    </Fragment>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * Les « branches » d'un match : depuis les centres des deux enfants (up/lo) du tour
 * précédent → bus vertical → sortie horizontale vers le match. Si un seul enfant (bye),
 * on trace une simple ligne droite.
 */
function Branches({ center, up, lo }: { center: number; up?: number; lo?: number }) {
  const bus = CONNECTOR_W / 2;
  if (up == null) return null;
  if (lo == null) {
    // Bye : ligne droite de l'enfant jusqu'au match.
    return <View pointerEvents="none" style={[styles.branchH, { top: center - LINE / 2, left: 0, width: CONNECTOR_W }]} />;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.branchH, { top: up - LINE / 2, left: 0, width: bus }]} />
      <View style={[styles.branchH, { top: lo - LINE / 2, left: 0, width: bus }]} />
      <View style={[styles.branchV, { top: up, height: lo - up, left: bus - LINE / 2 }]} />
      <View style={[styles.branchH, { top: center - LINE / 2, left: bus, width: bus }]} />
    </View>
  );
}

/** Carte compacte (hauteur fixe = 2 slots) d'un match dans le tableau. Tap = saisie du score. */
function BracketCard({
  m,
  nameOf,
  onOpen,
  canScore,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  onOpen: (m: TournamentMatch) => void;
  canScore: boolean;
}) {
  const decided = !!m.winner;
  const live = canScore && !decided;
  const setsWon = (m.score ?? '0-0').split('-');
  return (
    <Pressable disabled={!m.player_a || !m.player_b} onPress={() => onOpen(m)} style={[styles.bCard, live && styles.bCardLive]}>
      {[m.player_a, m.player_b].map((pid, i) => {
        const isWinner = decided && m.winner === pid;
        const empty = !pid;
        return (
          <View key={i} style={[styles.bSlot, i === 0 && styles.bSlotDiv, isWinner && styles.bSlotWin]}>
            <ThemedText
              type="smallBold"
              themeColor={empty ? 'textMuted' : isWinner ? 'brand' : 'text'}
              numberOfLines={1}
              style={{ flex: 1 }}>
              {empty ? 'À venir' : nameOf(pid)}
            </ThemedText>
            {decided ? (
              <ThemedText type="smallBold" themeColor={isWinner ? 'brand' : 'textMuted'}>
                {setsWon[i] ?? '0'}
              </ThemedText>
            ) : null}
            {isWinner ? <Ionicons name="checkmark" size={14} color={Palette.evergreen} /> : null}
          </View>
        );
      })}
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

  metaStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },

  // Classement final + podium
  classement: { marginTop: Spacing.four, gap: Spacing.three },
  classementTitle: { textAlign: 'center' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: Spacing.two },
  podCol: { alignItems: 'center', gap: Spacing.one, width: 100 },
  podName: { textAlign: 'center', maxWidth: 96 },
  podBar: { width: 74, borderTopLeftRadius: Radius.sm, borderTopRightRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.two },
  podPlace: { color: Palette.evergreen },
  rankList: { gap: Spacing.two },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  rankNum: { width: 22, textAlign: 'center' },
  reviewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },

  section: { marginTop: Spacing.four, marginBottom: Spacing.two, gap: Spacing.half },

  // Fil d'avancement
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  stepItem: { alignItems: 'center', gap: Spacing.one, width: 84 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Palette.border,
    backgroundColor: Palette.white,
  },
  stepDotOn: { borderColor: Palette.evergreen },
  stepDotCurrent: { backgroundColor: Palette.evergreen },
  stepLbl: { textAlign: 'center' },
  stepBar: { flex: 1, height: 1.5, backgroundColor: Palette.border, marginTop: 12 },
  stepBarOn: { backgroundColor: Palette.evergreen },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.four, marginBottom: Spacing.two },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  addCard: { maxHeight: '80%' },
  addList: { maxHeight: 380 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },

  // Rappel du modèle de droits (saisie des scores).
  permHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
  },

  // Vue Participants
  partRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  partRank: { width: 20, textAlign: 'center' },
  partNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  orgaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  poulePill: {
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  partRecord: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
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
  pouleTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  standHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.border,
    marginBottom: Spacing.half,
  },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, paddingHorizontal: Spacing.one, borderRadius: Radius.xs },
  standRowQ: { backgroundColor: 'rgba(230,255,165,0.45)' },
  standRank: { width: 18, textAlign: 'center' },
  standName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 0 },
  standNameText: { flexShrink: 1 },
  statCell: { width: 22, textAlign: 'center' },
  setCell: { width: 64, textAlign: 'right' },
  forfeitIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  forfeitRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three, marginTop: Spacing.four },
  forfeitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.red,
    backgroundColor: 'rgba(255,140,140,0.12)',
  },
  forfeitText: { color: Palette.redInk },

  // Onglets Poules / Phase finale
  tabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    padding: Spacing.half,
    marginTop: Spacing.four,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.pill },
  tabOn: { backgroundColor: Palette.evergreen },
  qBadge: {
    flexShrink: 0,
    backgroundColor: Palette.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  pouleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
  },
  pouleMatches: { marginTop: Spacing.three, gap: Spacing.two },

  // Tableau (bracket) horizontal avec branches
  treeScroll: { paddingVertical: Spacing.two, paddingRight: Spacing.four },
  treeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  treeColHead: { height: LABEL_H, justifyContent: 'center', alignItems: 'center' },
  cardPos: { position: 'absolute', width: CARD_W },
  branchH: { position: 'absolute', height: LINE, backgroundColor: Palette.border },
  branchV: { position: 'absolute', width: LINE, backgroundColor: Palette.border },
  bCard: {
    height: CARD_H,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  bCardLive: { borderColor: Palette.evergreen },
  bSlot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two },
  bSlotDiv: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.border },
  bSlotWin: { backgroundColor: Palette.lime },

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
  modalCard: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalSub: { marginBottom: Spacing.three },
  detailPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  detailPlayerWin: { backgroundColor: Palette.lime, borderColor: Palette.evergreen },
  detailSets: { alignItems: 'center', gap: Spacing.one, marginTop: Spacing.three },
  cta: {
    marginTop: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
