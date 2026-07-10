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
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
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
  addGuestToTournament,
  addPlayersToTournament,
  bestOfForMatch,
  computeFinalRanking,
  computePlayerRecords,
  computePouleStandings,
  fetchTournamentDetail,
  type FinalRankEntry,
  forfeitPlayerInPoule,
  recordTournamentForfeit,
  recordTournamentMatch,
  redrawTournament,
  removePlayerFromTournament,
  resetTournamentToOpen,
  setTournamentFormats,
  setTournamentOrganizer,
  setTournamentPlays,
  startTournament,
  TOURNAMENT_FORMATS,
  type TournamentFormat,
  updateTournamentGuest,
  updateTournamentMaxPlayers,
  type TournamentDetail,
  type TournamentMatch,
  type TournamentPlayer,
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
  const [coorgaOpen, setCoorgaOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [candidates, setCandidates] = useState<LeaderboardEntry[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [guestName, setGuestName] = useState('');
  const [guestElo, setGuestElo] = useState('');
  const [openPoules, setOpenPoules] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'poules' | 'finale'>('poules');
  const [showJourney, setShowJourney] = useState(false); // tournoi fini : révéler poules+tableau
  const [maxOpen, setMaxOpen] = useState(false); // édition de la capacité (joueurs max) avant lancement
  const [maxDraft, setMaxDraft] = useState(8);
  const [editGuest, setEditGuest] = useState<TournamentPlayer | null>(null); // édition d'un invité (nom + ELO)
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestElo, setEditGuestElo] = useState('');
  const [formatOpen, setFormatOpen] = useState(false); // édition des formats (poules / tableau)
  const [pouleFmtDraft, setPouleFmtDraft] = useState<TournamentFormat>('bo5');
  const [bracketFmtDraft, setBracketFmtDraft] = useState<TournamentFormat>('bo5');

  const load = useCallback(() => {
    if (id) fetchTournamentDetail(id).then(setDetail);
  }, [id]);

  useFocusEffect(load);

  if (!detail) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Palette.onyx} />
      </View>
    );
  }

  const { tournament, players, matches } = detail;
  const isOwner = tournament.owner_id === myId;
  // Un co-organisateur gère l'événement comme l'organisateur : inscrire/retirer des joueurs et
  // lancer le tournoi. Seule la GESTION DES RÔLES (promouvoir un co-orga, desk/joue) reste à l'owner.
  const canManage = isOwner || players.some((p) => p.player_id === myId && p.organizer);
  const records = computePlayerRecords(matches); // bilan V/D global (vue Participants)
  const nameOf = (pid: string | null) => players.find((p) => p.player_id === pid)?.name ?? '-';
  const avatarOf = (pid: string | null) => players.find((p) => p.player_id === pid)?.avatar ?? null;
  const goPlayer = (pid: string) => router.push({ pathname: '/player', params: { id: pid } });
  // Tournoi terminé → on met le CLASSEMENT en avant et on masque poules/tableau (révélables au besoin).
  const reviewOpen = tournament.status !== 'done' || showJourney;
  // Tap sur un match (poule ou tableau) : si je peux saisir le score d'un match encore à jouer,
  // on ouvre DIRECTEMENT la saisie (pas la fiche). Sinon → fiche détail lisible par tous.
  // Important : ouvrir la saisie DEPUIS la fiche empilerait 2 modales → sur iOS ça fige l'app.
  const openDetail = (m: TournamentMatch) => {
    if (!m.player_a || !m.player_b) return; // bye / slot vide
    if (mayScore(m) && !m.winner) openScore(m);
    else setMatchDetail(m);
  };
  // Qui peut saisir un score : un organisateur (owner OU co-orga → tous les matchs) ou un des 2
  // joueurs du match (le sien). Le RLS `tmatches score owner or players` (0057) autorise déjà les co-orgas.
  const mayScore = (m: TournamentMatch) =>
    !!m.player_a && !!m.player_b && (canManage || m.player_a === myId || m.player_b === myId);

  // Capacité (joueurs max) modifiable tant que le tournoi n'est pas lancé. Plancher = nb d'inscrits
  // (on ne descend pas sous les déjà-inscrits) mais au moins 2 ; plafond = 64 (comme à la création).
  const maxFloor = Math.max(2, players.length);
  const clampMax = (n: number) => Math.min(64, Math.max(maxFloor, n));

  function openEditMax() {
    setMaxDraft(tournament.max_players);
    setMaxOpen(true);
  }

  async function saveMax() {
    const value = clampMax(maxDraft);
    if (value === tournament.max_players) {
      setMaxOpen(false);
      return;
    }
    try {
      setBusy(true);
      await updateTournamentMaxPlayers(tournament.id, value);
      setMaxOpen(false);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

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

  /** Ouvre la feuille d'édition d'un invité (nom + ELO), pré-remplie. */
  function openEditGuest(p: TournamentPlayer) {
    setEditGuest(p);
    setEditGuestName(p.name);
    setEditGuestElo(String(p.elo));
  }

  async function saveEditGuest() {
    if (!editGuest) return;
    const name = editGuestName.trim();
    if (!name) return;
    try {
      setBusy(true);
      const elo = editGuestElo.trim() ? Number.parseInt(editGuestElo, 10) : undefined;
      await updateTournamentGuest(tournament.id, editGuest.player_id, name, elo);
      setEditGuest(null);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  /** Ouvre l'édition des formats (poules / tableau), pré-remplie sur les valeurs courantes. */
  function openEditFormats() {
    setPouleFmtDraft(tournament.format);
    setBracketFmtDraft(tournament.bracket_format ?? tournament.format);
    setFormatOpen(true);
  }

  async function saveFormats() {
    try {
      setBusy(true);
      // Tableau direct : pas de poules → le format « tableau » EST le format unique du tournoi.
      const poule = tournament.structure === 'bracket' ? bracketFmtDraft : pouleFmtDraft;
      await setTournamentFormats(tournament.id, poule, bracketFmtDraft);
      setFormatOpen(false);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  /** Refait le tirage (poules ou tableau) avec les mêmes inscrits — tant qu'aucun score n'est saisi. */
  async function redraw() {
    if (
      !(await confirm({
        title: 'Refaire le tirage ?',
        message: 'Les poules / le tableau seront régénérés avec les inscrits actuels.',
        confirmText: 'Refaire',
      }))
    )
      return;
    try {
      setBusy(true);
      await redrawTournament(tournament.id);
      load();
    } catch (e) {
      notify('Impossible de refaire le tirage', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  /** Revient à l'écran d'inscriptions (pour ajouter/retirer un joueur) — le tirage sera refait au relancement. */
  async function backToOpen() {
    if (
      !(await confirm({
        title: 'Modifier les inscrits ?',
        message: 'Retour aux inscriptions pour ajouter ou retirer des joueurs. Le tirage actuel sera effacé (aucun score n’a encore été saisi) et refait au relancement.',
        confirmText: 'Modifier',
      }))
    )
      return;
    try {
      setBusy(true);
      await resetTournamentToOpen(tournament.id);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  // Best-of dépendant de la PHASE du match : poules et tableau peuvent avoir des formats distincts.
  const bestOfFor = (m: TournamentMatch | null) => bestOfForMatch(tournament, m?.phase ?? 'poule');
  // Seuls les participants qui jouent sont tirés dans les poules (les orgas « au desk » gèrent sans jouer).
  const playingCount = players.filter((p) => p.plays).length;
  // Deux groupes distincts pour + de clarté : l'organisation (owner + co-orgas) et le tirage réel
  // (ceux qui jouent). Un organisateur qui joue apparaît dans les deux (badge « orga » côté Joueurs).
  const staff = players.filter((p) => p.player_id === tournament.owner_id || p.organizer);
  const draw = players.filter((p) => p.plays);
  const nonStaff = players.filter((p) => p.player_id !== tournament.owner_id && !p.organizer);
  // Un vrai résultat a été saisi ? (on ignore les byes auto du tableau direct = un seul joueur présent)
  const hasRealResult = matches.some((m) => !!m.winner && !!m.player_a && !!m.player_b);
  // Libellé du/des format(s). Tableau direct → un seul format. Poules+tableau → « BO3 / BO5 » si distincts.
  const pouleFmtLabel = TOURNAMENT_FORMATS[tournament.format]?.label ?? tournament.format;
  const brFmt = tournament.bracket_format ?? tournament.format;
  const brFmtLabel = TOURNAMENT_FORMATS[brFmt]?.label ?? brFmt;
  const fmtLabel =
    tournament.structure === 'bracket'
      ? brFmtLabel
      : tournament.bracket_format && tournament.bracket_format !== tournament.format
        ? `${pouleFmtLabel} / ${brFmtLabel}`
        : pouleFmtLabel;
  const canEditFormat = canManage && tournament.status !== 'done';

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

  /** Ajoute un invité (sans compte) ; on garde la feuille ouverte pour en enchaîner plusieurs. */
  async function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    try {
      setBusy(true);
      const elo = guestElo.trim() ? Number.parseInt(guestElo, 10) : undefined;
      await addGuestToTournament(tournament.id, name, elo);
      setGuestName('');
      setGuestElo('');
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  /** Retire un inscrit avant le lancement (phase inscriptions). L'organisateur ne peut pas s'auto-retirer. */
  async function removePlayer(p: TournamentPlayer) {
    if (
      !(await confirm({
        title: 'Retirer ce joueur ?',
        message: `${p.name} sera retiré du tournoi.`,
        confirmText: 'Retirer',
        destructive: true,
      }))
    )
      return;
    try {
      setBusy(true);
      await removePlayerFromTournament(tournament.id, p.player_id);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  /** Promeut / rétrograde un participant déjà inscrit comme co-organisateur (saisie des scores). */
  async function toggleOrganizer(p: TournamentPlayer) {
    try {
      await setTournamentOrganizer(tournament.id, p.player_id, !p.organizer);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    }
  }

  /** Bascule un participant « joue » ↔ « au desk » (gère sans être tiré dans les poules). */
  async function togglePlays(p: TournamentPlayer) {
    try {
      await setTournamentPlays(tournament.id, p.player_id, !p.plays);
      load();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    }
  }

  /** Ouvre le sélecteur pour ajouter un co-organisateur directement (par son compte). */
  async function openAddCoorga() {
    setCoorgaOpen(true);
    const all = await fetchLeaderboard(200);
    const orgs = new Set(players.filter((p) => p.organizer || p.player_id === tournament.owner_id).map((p) => p.player_id));
    setCandidates(all.filter((c) => !orgs.has(c.id)));
  }

  /** Ajoute directement un co-organisateur (upsert côté RPC) : il est « au desk » par défaut. */
  async function pickCoorga(playerId: string) {
    try {
      setBusy(true);
      await setTournamentOrganizer(tournament.id, playerId, true);
      setCoorgaOpen(false);
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
    setSets(existing.length ? existing : Array.from({ length: Math.ceil(bestOfFor(m) / 2) }, () => ({ a: '', b: '' })));
    setScoring(m);
  }

  async function submitScore() {
    if (!scoring) return;
    const valid = validateMatch(numericSets(sets), bestOfFor(scoring));
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
        message: `${nameOf(absentId)} est forfait : ${nameOf(presentId)} gagne le match ${Math.ceil(bestOfFor(scoring) / 2)}-0.`,
        confirmText: 'Forfait',
        destructive: true,
      }))
    )
      return;
    try {
      setBusy(true);
      await recordTournamentForfeit(tournament.id, scoring, presentId, bestOfFor(scoring));
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
      await forfeitPlayerInPoule(detail!, playerId, bestOfForMatch(tournament, 'poule'));
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
  // Nb TOTAL de tours, déduit du 1er tour (round 0), PAS du nb de tours déjà générés. Sinon un
  // tableau direct où seul le round 0 existe afficherait « Finale » dès le 1er tour (labels décalés).
  const round0Count = bracketMatches.filter((m) => (m.round ?? 0) === 0).length;
  const bracketTotalRounds = round0Count > 0 ? Math.round(Math.log2(round0Count)) + 1 : Math.max(1, bracketRounds.length);
  // Classement final (podium + liste), calculé seulement quand le tournoi est terminé.
  const ranking = tournament.status === 'done' ? computeFinalRanking(players, matches) : [];

  // Poules et phase finale sur des « pages » distinctes (onglets) pour ne pas tout mélanger.
  const hasBracket = bracketRounds.length > 0;
  const hasPoulesView = poules.length > 0 && tournament.status !== 'open';
  const showTabs = hasBracket && hasPoulesView;
  const activeTab: 'poules' | 'finale' = showTabs ? tab : hasBracket ? 'finale' : 'poules';

  // Ligne de la feuille Participants (roster). Extraite pour rendre 2 groupes (Organisation / Joueurs).
  function renderPartRow(p: TournamentPlayer, i: number) {
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
            {p.isGuest ? (
              <View style={styles.guestBadge}>
                <ThemedText type="small" themeColor="textSecondary">
                  Invité
                </ThemedText>
              </View>
            ) : null}
            {!p.plays ? (
              <View style={styles.guestBadge}>
                <ThemedText type="small" themeColor="textSecondary">
                  Desk
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
        {isOwner ? (
          <View style={styles.orgCtrls}>
            {!isOrga && !p.isGuest ? (
              <Pressable
                onPress={() => toggleOrganizer(p)}
                hitSlop={6}
                style={[styles.coorgaPill, p.organizer ? styles.coorgaOn : styles.coorgaOff]}>
                <Ionicons name="shield-checkmark" size={12} color={p.organizer ? Palette.whitePP : Palette.grey} />
                <ThemedText type="small" themeColor={p.organizer ? 'onBrand' : 'textSecondary'}>
                  {p.organizer ? 'Co-orga' : 'Promo'}
                </ThemedText>
              </Pressable>
            ) : null}
            {isOrga || p.organizer ? (
              <Pressable
                onPress={() => togglePlays(p)}
                hitSlop={6}
                accessibilityRole="switch"
                accessibilityState={{ checked: p.plays }}
                style={[styles.switch, p.plays ? styles.switchOn : styles.switchOff]}>
                <View style={[styles.switchKnob, p.plays ? styles.switchKnobOn : styles.switchKnobOff]} />
              </Pressable>
            ) : null}
          </View>
        ) : !isOrga && p.organizer ? (
          <View style={styles.orgaBadge}>
            <Ionicons name="shield-checkmark" size={11} color={Palette.evergreen} />
            <ThemedText type="small" themeColor="brand">
              Co-orga
            </ThemedText>
          </View>
        ) : null}
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
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
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
                {canEditFormat ? (
                  <Pressable onPress={openEditFormats} hitSlop={8} style={styles.fmtEdit}>
                    <ThemedText type="smallBold" themeColor="onBrand">
                      {fmtLabel}
                    </ThemedText>
                    <Ionicons name="pencil" size={12} color={Palette.lime} />
                  </Pressable>
                ) : (
                  <ThemedText type="smallBold" themeColor="onBrand">
                    {fmtLabel}
                  </ThemedText>
                )}
                {/* L'organisateur peut ajuster la capacité (joueurs max) tant que ce n'est pas lancé. */}
                {isOwner ? (
                  <Pressable onPress={openEditMax} hitSlop={8} style={styles.maxEdit}>
                    <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.9 }}>
                      {players.length}/{tournament.max_players} joueurs
                    </ThemedText>
                    <Ionicons name="pencil" size={12} color={Palette.lime} />
                  </Pressable>
                ) : (
                  <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.8 }}>
                    {players.length}/{tournament.max_players} joueurs
                  </ThemedText>
                )}
                {tournament.is_ranked ? (
                  <ThemedText type="small" style={{ color: Palette.lime }}>
                    Classé
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          ) : (
            <View style={styles.metaStrip}>
              {canEditFormat ? (
                <Pressable onPress={openEditFormats} hitSlop={8} style={styles.fmtEdit}>
                  <ThemedText type="smallBold" themeColor="brand">
                    {fmtLabel}
                  </ThemedText>
                  <Ionicons name="pencil" size={11} color={Palette.onyx} />
                </Pressable>
              ) : (
                <ThemedText type="smallBold" themeColor="brand">
                  {fmtLabel}
                </ThemedText>
              )}
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
                <Ionicons name={showJourney ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.onyx} />
              </Pressable>
            </View>
          ) : null}

          {/* Qui saisit les scores : rappel du modèle de droits (orga = tout, joueur = ses matchs). */}
          {tournament.status === 'poules' || tournament.status === 'bracket' ? (
            <View style={styles.permHint}>
              <Ionicons name={canManage ? 'shield-checkmark' : 'information-circle-outline'} size={16} color={Palette.onyx} />
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {canManage
                  ? 'Organisateur : tu peux saisir le score de tous les matchs.'
                  : 'Tu peux saisir le score de tes propres matchs ; l’organisateur gère les autres.'}
              </ThemedText>
            </View>
          ) : null}

          {/* Refaire le tirage / revenir aux inscriptions — organisateur, tant qu'aucun score n'est saisi.
              (Ex. « il manquait quelqu'un » : on ajoute puis on relance.) Masqué dès le 1er vrai résultat. */}
          {canManage && !hasRealResult && (tournament.status === 'poules' || tournament.status === 'bracket') ? (
            <View style={styles.redrawBar}>
              <Pressable style={styles.redrawBtn} disabled={busy} onPress={redraw}>
                <Ionicons name="shuffle" size={16} color={Palette.onyx} />
                <ThemedText type="smallBold" themeColor="brand">
                  Refaire le tirage
                </ThemedText>
              </Pressable>
              <Pressable style={styles.redrawBtn} disabled={busy} onPress={backToOpen}>
                <Ionicons name="person-add-outline" size={16} color={Palette.onyx} />
                <ThemedText type="smallBold" themeColor="brand">
                  Modifier les inscrits
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          {/* ───────── Inscriptions ───────── */}
          {tournament.status === 'open' ? (
            <>
              {/* ── Organisation : owner + co-orgas, séparés du tirage pour + de clarté. ── */}
              <View style={styles.sectionRow}>
                <ThemedText type="sectionTitle" themeColor="textSecondary">
                  Organisation
                </ThemedText>
                {isOwner ? (
                  <Pressable style={styles.addBtn} onPress={openAddCoorga}>
                    <Ionicons name="shield-checkmark" size={15} color={Palette.evergreen} />
                    <ThemedText type="smallBold" themeColor="brand">
                      Co-orga
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.list}>
                {staff.map((p) => {
                  const isOrga = p.player_id === tournament.owner_id;
                  return (
                    <View key={p.player_id} style={styles.row}>
                      <Avatar name={p.name} size={40} uri={p.avatar} />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="cardTitle" numberOfLines={1}>
                          {p.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textMuted">
                          {isOrga ? 'Organisateur' : 'Co-organisateur'}
                        </ThemedText>
                      </View>
                      {/* Seul l'owner bascule joue/desk (RPC set_tournament_plays owner-only). */}
                      {isOwner ? (
                        <Pressable
                          onPress={() => togglePlays(p)}
                          hitSlop={6}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: p.plays }}
                          style={styles.playsCtrl}>
                          <ThemedText type="smallBold" themeColor={p.plays ? 'text' : 'textSecondary'}>
                            {p.plays ? 'Je joue' : 'Au desk'}
                          </ThemedText>
                          <View style={[styles.switch, p.plays ? styles.switchOn : styles.switchOff]}>
                            <View style={[styles.switchKnob, p.plays ? styles.switchKnobOn : styles.switchKnobOff]} />
                          </View>
                        </Pressable>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          {p.plays ? 'Joue' : 'Au desk'}
                        </ThemedText>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* ── Joueurs : le tirage réel (plays = true). Un orga qui joue y figure aussi (badge). ── */}
              <View style={styles.sectionRow}>
                <ThemedText type="sectionTitle" themeColor="textSecondary">
                  Joueurs ({playingCount}/{tournament.max_players})
                </ThemedText>
                {canManage && players.length < tournament.max_players ? (
                  <Pressable style={styles.addBtn} onPress={openAddPlayers}>
                    <Ionicons name="person-add" size={16} color={Palette.evergreen} />
                    <ThemedText type="smallBold" themeColor="brand">
                      Ajouter
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.list}>
                {draw.length === 0 ? (
                  <View style={styles.empty}>
                    <ThemedText type="default" themeColor="textSecondary">
                      Personne dans le tirage. Ajoute des joueurs, ou fais jouer un organisateur.
                    </ThemedText>
                  </View>
                ) : (
                  draw.map((p) => {
                    const isOrga = p.player_id === tournament.owner_id;
                    return (
                      <View key={p.player_id} style={styles.row}>
                        <Avatar name={p.name} size={40} uri={p.avatar} />
                        <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                          {p.name}
                          {isOrga || p.organizer ? ' · orga' : ''}
                        </ThemedText>
                        {/* Éditer un invité (nom + ELO) — organisateur uniquement. */}
                        {canManage && p.isGuest ? (
                          <Pressable onPress={() => openEditGuest(p)} hitSlop={8} style={styles.editBtn}>
                            <Ionicons name="pencil" size={16} color={Palette.onyx} />
                          </Pressable>
                        ) : null}
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          {p.isGuest ? 'Invité' : p.elo}
                        </ThemedText>
                        {/* Retirer un inscrit (jamais l'organisateur). */}
                        {canManage && !isOrga ? (
                          <Pressable onPress={() => removePlayer(p)} disabled={busy} hitSlop={8} style={styles.removeBtn}>
                            <Ionicons name="close-circle" size={22} color={Palette.grey} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
              {canManage ? (
                <Pressable style={[styles.cta, (busy || playingCount < 2) && { opacity: 0.5 }]} disabled={busy || playingCount < 2} onPress={launch}>
                  <ThemedText type="cardTitle" themeColor="onBrand">
                    Lancer le tournoi ({playingCount} joueur{playingCount > 1 ? 's' : ''})
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
                      {canManage && tournament.status === 'poules' ? <View style={styles.forfeitIcon} /> : null}
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
                        {canManage && tournament.status === 'poules' ? (
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
                            color={Palette.onyx}
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
                totalRounds={bracketTotalRounds}
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
                bestOf={bestOfFor(scoring)}
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
              {/* Forfait (bouton destructif rouge) : un organisateur (owner/co-orga) peut déclarer forfait
                  l'un OU l'autre joueur ; un joueur ne peut déclarer QUE lui-même forfait (l'autre gagne 3-0). */}
              <View style={styles.forfeitRow}>
                {[scoring.player_a, scoring.player_b]
                  .filter((pid): pid is string => !!pid && (canManage || pid === myId))
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
                  : roundName(matchDetail.round ?? 0, bracketTotalRounds)}{' '}
                · Bo{bestOfFor(matchDetail)}
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
                    // On laisse la fiche se fermer AVANT d'ouvrir la saisie : empiler 2 modales fige iOS.
                    setTimeout(() => openScore(m), 260);
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

          {/* Invité : pas besoin de compte, l'organisateur le crée à la volée (ELO optionnel). */}
          <View style={styles.guestForm}>
            <TextInput
              style={styles.guestNameInput}
              placeholder="Nom de l'invité"
              placeholderTextColor={Palette.grey}
              value={guestName}
              onChangeText={setGuestName}
              returnKeyType="done"
              onSubmitEditing={addGuest}
            />
            <TextInput
              style={styles.guestEloInput}
              placeholder="ELO"
              placeholderTextColor={Palette.grey}
              value={guestElo}
              onChangeText={(t) => setGuestElo(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={addGuest}
            />
            <Pressable
              style={[styles.guestAddBtn, (!guestName.trim() || busy) && { opacity: 0.5 }]}
              disabled={!guestName.trim() || busy}
              onPress={addGuest}>
              <Ionicons name="person-add" size={18} color={Palette.whitePP} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textMuted" style={{ marginBottom: Spacing.two }}>
            Sans ELO → 1000 par défaut. Puis choisis des joueurs existants ci-dessous.
          </ThemedText>

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
                    <Avatar name={c.display_name} uri={c.avatar_url} size={36} />
                    <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                      {c.display_name}
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {c.elo}
                    </ThemedText>
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={on ? Palette.onyx : Palette.border}
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
          {isOwner ? (
            <Pressable
              style={styles.coorgaAddBtn}
              onPress={() => {
                setParticipantsOpen(false);
                openAddCoorga();
              }}>
              <Ionicons name="shield-checkmark" size={16} color={Palette.whitePP} />
              <ThemedText type="smallBold" themeColor="onBrand">
                Ajouter un co-organisateur
              </ThemedText>
            </Pressable>
          ) : null}
          <ScrollView style={styles.addList} showsVerticalScrollIndicator={false}>
            {/* Organisation d'abord (owner + co-orgas), puis les joueurs — deux groupes distincts. */}
            {staff.length ? (
              <ThemedText type="label" themeColor="textMuted" style={styles.partGroupLbl}>
                ORGANISATION
              </ThemedText>
            ) : null}
            {staff.map((p, i) => renderPartRow(p, i))}
            <ThemedText type="label" themeColor="textMuted" style={styles.partGroupLbl}>
              JOUEURS ({nonStaff.length})
            </ThemedText>
            {nonStaff.length ? (
              nonStaff.map((p, i) => renderPartRow(p, i))
            ) : (
              <ThemedText type="small" themeColor="textMuted" style={{ paddingVertical: Spacing.two }}>
                Aucun joueur pour l’instant.
              </ThemedText>
            )}
          </ScrollView>
        </SwipeSheet>

        {/* Ajouter un co-organisateur directement (par son compte, sans passer par le code). */}
        <SwipeSheet visible={coorgaOpen} onClose={() => setCoorgaOpen(false)} style={[styles.modalCard, styles.addCard]}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Ajouter un co-organisateur</ThemedText>
            <Pressable onPress={() => setCoorgaOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textMuted" style={{ marginBottom: Spacing.two }}>
            Il pourra saisir les scores depuis son tél. Ajouté « au desk » (ne joue pas) — bascule-le en « joue » depuis la liste si besoin.
          </ThemedText>
          <ScrollView style={styles.addList} showsVerticalScrollIndicator={false}>
            {candidates.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary" style={{ paddingVertical: Spacing.three }}>
                Aucun joueur disponible.
              </ThemedText>
            ) : (
              candidates.map((c) => (
                <Pressable key={c.id} disabled={busy} onPress={() => pickCoorga(c.id)} style={styles.addRow}>
                  <Avatar name={c.display_name} uri={c.avatar_url} size={36} />
                  <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {c.display_name}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {c.elo}
                  </ThemedText>
                  <Ionicons name="shield-outline" size={20} color={Palette.onyx} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </SwipeSheet>

        {/* Modifier la capacité (joueurs max) — organisateur, tant que le tournoi n'est pas lancé. */}
        <SwipeSheet visible={maxOpen} onClose={() => setMaxOpen(false)} style={styles.modalCard}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Nombre de joueurs max</ThemedText>
            <Pressable onPress={() => setMaxOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalSub}>
            Capacité du tournoi (min. {maxFloor} · max. 64). Modifiable tant qu’il n’est pas lancé.
          </ThemedText>
          <View style={styles.maxStepper}>
            <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => setMaxDraft((n) => clampMax(n - 1))}>
              <Ionicons name="remove" size={22} color={Palette.onyx} />
            </Pressable>
            <ThemedText type="title" themeColor="brand">
              {clampMax(maxDraft)}
            </ThemedText>
            <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => setMaxDraft((n) => clampMax(n + 1))}>
              <Ionicons name="add" size={22} color={Palette.onyx} />
            </Pressable>
          </View>
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={saveMax}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            )}
          </Pressable>
        </SwipeSheet>

        {/* Éditer un invité (nom + ELO) — organisateur. Le nom est cosmétique ; l'ELO sert au seeding. */}
        <SwipeSheet visible={!!editGuest} onClose={() => setEditGuest(null)} style={styles.modalCard}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Modifier l’invité</ThemedText>
            <Pressable onPress={() => setEditGuest(null)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          <View style={styles.guestForm}>
            <TextInput
              style={styles.guestNameInput}
              placeholder="Nom de l'invité"
              placeholderTextColor={Palette.grey}
              value={editGuestName}
              onChangeText={setEditGuestName}
              returnKeyType="done"
              onSubmitEditing={saveEditGuest}
            />
            <TextInput
              style={styles.guestEloInput}
              placeholder="ELO"
              placeholderTextColor={Palette.grey}
              value={editGuestElo}
              onChangeText={(t) => setEditGuestElo(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={saveEditGuest}
            />
          </View>
          <ThemedText type="small" themeColor="textMuted" style={{ marginTop: Spacing.one }}>
            L’ELO sert au tirage (têtes de série). Le modifier après le lancement ne re-seed pas : utilise « Refaire le tirage ».
          </ThemedText>
          <Pressable
            style={[styles.cta, (!editGuestName.trim() || busy) && { opacity: 0.6 }]}
            disabled={!editGuestName.trim() || busy}
            onPress={saveEditGuest}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            )}
          </Pressable>
        </SwipeSheet>

        {/* Éditer les formats (poules / tableau) — organisateur, tant que le tournoi n'est pas terminé. */}
        <SwipeSheet visible={formatOpen} onClose={() => setFormatOpen(false)} style={styles.modalCard}>
          <View style={styles.modalHead}>
            <ThemedText type="cardTitle">Format des matchs</ThemedText>
            <Pressable onPress={() => setFormatOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Palette.onyx} />
            </Pressable>
          </View>
          {tournament.structure === 'bracket' ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fmtRowLbl}>
                TABLEAU
              </ThemedText>
              <FormatChips value={bracketFmtDraft} onChange={setBracketFmtDraft} />
            </>
          ) : (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fmtRowLbl}>
                POULES
              </ThemedText>
              <FormatChips value={pouleFmtDraft} onChange={setPouleFmtDraft} />
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fmtRowLbl}>
                TABLEAU FINAL
              </ThemedText>
              <FormatChips value={bracketFmtDraft} onChange={setBracketFmtDraft} />
            </>
          )}
          <ThemedText type="small" themeColor="textMuted" style={{ marginTop: Spacing.two }}>
            Les scores déjà saisis ne changent pas ; seule la saisie des prochains matchs est concernée.
          </ThemedText>
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={saveFormats}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            )}
          </Pressable>
        </SwipeSheet>
      </SafeAreaView>
    </View>
  );
}

/** Sélecteur de format (BO1/BO3/BO5/BO7) sous forme de chips — réutilisé pour poules et tableau. */
function FormatChips({ value, onChange }: { value: TournamentFormat; onChange: (f: TournamentFormat) => void }) {
  return (
    <View style={styles.fmtChips}>
      {(['bo1', 'bo3', 'bo5', 'bo7'] as const).map((f) => {
        const on = value === f;
        return (
          <Pressable key={f} onPress={() => onChange(f)} style={[styles.fmtChip, on ? styles.fmtChipOn : styles.fmtChipOff]}>
            <ThemedText type="smallBold" themeColor={on ? 'onBrand' : 'text'}>
              {TOURNAMENT_FORMATS[f].label}
            </ThemedText>
          </Pressable>
        );
      })}
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
                  <Ionicons name="checkmark" size={13} color={current ? Palette.whitePP : Palette.onyx} />
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
  totalRounds,
  matches,
  nameOf,
  onOpen,
  canScore,
}: {
  rounds: number[];
  totalRounds: number;
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
                  {roundName(r, totalRounds)}
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
    backgroundColor: Palette.onyx,
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
  podPlace: { color: Palette.onyx },
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
  stepDotOn: { borderColor: Palette.onyx },
  stepDotCurrent: { backgroundColor: Palette.onyx },
  stepLbl: { textAlign: 'center' },
  stepBar: { flex: 1, height: 1.5, backgroundColor: Palette.border, marginTop: 12 },
  stepBarOn: { backgroundColor: Palette.onyx },
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

  // Ajout d'un invité (nom + ELO optionnel).
  guestForm: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  guestNameInput: {
    flex: 1,
    height: 46,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  guestEloInput: {
    width: 64,
    height: 46,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.two,
    textAlign: 'center',
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  guestAddBtn: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestBadge: {
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  coorgaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  coorgaOn: { backgroundColor: Palette.ink2 },
  coorgaOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  deskOn: { backgroundColor: Palette.onyx },
  // Toggle « Je joue / Au desk » (switch)
  playsCtrl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  switch: { width: 46, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: Palette.onyx },
  switchOff: { backgroundColor: Palette.border },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: Palette.white },
  switchKnobOn: { alignSelf: 'flex-end' },
  switchKnobOff: { alignSelf: 'flex-start' },
  orgCtrls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  coorgaAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
  },

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
  removeBtn: { marginLeft: Spacing.one },
  editBtn: { padding: 2, marginRight: Spacing.one },
  partGroupLbl: { marginTop: Spacing.three, marginBottom: Spacing.one, letterSpacing: 0.5 },
  // Barre d'actions « refaire le tirage » (poules/tableau, tant qu'aucun score).
  redrawBar: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  redrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.white,
  },
  fmtEdit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  fmtRowLbl: { marginTop: Spacing.three, marginBottom: Spacing.two },
  fmtChips: { flexDirection: 'row', gap: Spacing.two },
  fmtChip: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.xs, alignItems: 'center' },
  fmtChipOn: { backgroundColor: Palette.ink2 },
  fmtChipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  maxEdit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  maxStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.five, paddingVertical: Spacing.three },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.white,
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
  tabOn: { backgroundColor: Palette.ink2 },
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
  bCardLive: { borderColor: Palette.onyx },
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
  detailPlayerWin: { backgroundColor: Palette.lime, borderColor: Palette.onyx },
  detailSets: { alignItems: 'center', gap: Spacing.one, marginTop: Spacing.three },
  cta: {
    marginTop: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
