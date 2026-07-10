/**
 * Cartes interactives affichées dans le chat à la place d'une bulle texte.
 *  • ChallengeCard   - un défi (table `challenges`) : Accepter / Refuser pour le destinataire.
 *  • ScoreCard       - un score proposé (match dual-confirm) : Confirmer / Contester.
 * Les deux lisent leur statut « live » passé par le parent (chat.tsx) et n'écrivent rien
 * directement : elles déclenchent les callbacks qui appellent respondChallenge / confirmMatch.
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MatchScoreboard } from '@/components/match-scoreboard';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { FORMAT_INFO, type ChallengeFormat } from '@/lib/social/challenges';
import { countSets, parseSetScores } from '@/lib/matches/sets';

// ───────────────────────── Carte défi ─────────────────────────

export function ChallengeCard({
  format,
  status,
  mine,
  busy,
  onAccept,
  onDecline,
}: {
  format: ChallengeFormat;
  /** 'sent' | 'accepted' | 'declined' (depuis la table challenges). */
  status: string;
  /** true = c'est MOI qui ai lancé le défi. */
  mine: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const info = FORMAT_INFO[format] ?? FORMAT_INFO.bo5;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.iconBubble}>
          <Ionicons name="flame" size={18} color={Palette.whitePP} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="cardTitle">Défi · {info.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {info.detail}
          </ThemedText>
        </View>
      </View>

      {status === 'accepted' ? (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={18} color={Palette.onyx} />
          <ThemedText type="smallBold" themeColor="brand">
            Défi accepté
          </ThemedText>
        </View>
      ) : status === 'declined' ? (
        <View style={styles.statusRow}>
          <Ionicons name="close-circle" size={18} color={Palette.grey} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            Défi refusé
          </ThemedText>
        </View>
      ) : mine ? (
        <View style={styles.statusRow}>
          <Ionicons name="time-outline" size={18} color={Palette.grey} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            En attente de réponse
          </ThemedText>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onDecline} disabled={busy}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Refuser
            </ThemedText>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onAccept} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} size="small" />
            ) : (
              <ThemedText type="smallBold" themeColor="onBrand">
                Accepter
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ───────────────────────── Carte score ─────────────────────────

export function ScoreCard({
  setScores,
  score,
  bestOf,
  status,
  proposerIsMe,
  myName,
  otherName,
  busy,
  onConfirm,
  onDispute,
}: {
  /** Détail des manches, vu du PROPOSEUR (= player_a). */
  setScores: string | null;
  /** Score agrégé "a-b" vu du proposeur. */
  score: string;
  bestOf: number;
  /** 'pending' | 'confirmed' | 'disputed' (depuis la table matches). */
  status: string;
  /** true = c'est MOI qui ai proposé le score. */
  proposerIsMe: boolean;
  myName: string;
  otherName: string;
  busy?: boolean;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  // Le proposeur est toujours en HAUT du scoreboard (set_scores est à sa perspective).
  const counts = countSets(parseSetScores(setScores));
  const [a, b] = score.split('-').map((n) => Number.parseInt(n, 10));
  const proposerWon = setScores ? counts.a > counts.b : (a ?? 0) > (b ?? 0);

  return (
    <View style={styles.card}>
      <MatchScoreboard
        topName={proposerIsMe ? 'Toi' : otherName}
        bottomName={proposerIsMe ? otherName : 'Toi'}
        setScores={setScores}
        score={score}
        topWon={proposerWon}
        ranked
        format={`BO${bestOf}`}
      />

      {status === 'confirmed' ? (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={18} color={Palette.onyx} />
          <ThemedText type="smallBold" themeColor="brand">
            Score confirmé · classé
          </ThemedText>
        </View>
      ) : status === 'disputed' ? (
        <View style={styles.statusRow}>
          <Ionicons name="alert-circle" size={18} color={Palette.redInk} />
          <ThemedText type="smallBold" themeColor="danger">
            Score contesté
          </ThemedText>
        </View>
      ) : proposerIsMe ? (
        <View style={styles.statusRow}>
          <Ionicons name="time-outline" size={18} color={Palette.grey} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            En attente de la confirmation de {otherName}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onDispute} disabled={busy}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Contester
            </ThemedText>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onConfirm} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} size="small" />
            ) : (
              <ThemedText type="smallBold" themeColor="onBrand">
                Confirmer
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  btn: { flex: 1, height: 44, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: Palette.onyx },
  btnGhost: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
});
