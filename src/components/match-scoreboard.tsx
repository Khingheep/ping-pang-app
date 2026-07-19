/**
 * Scoreboard d'un match, façon tableau de tennis de table : deux lignes (joueur A / joueur B),
 * une colonne par manche séparée par une barre, et le total de manches gagnées à droite.
 * Le gagnant de chaque manche a son score en surbrillance ; le vainqueur du match a un badge vert.
 * Générique : montre deux joueurs quelconques (feed global). set_scores est vu du joueur du HAUT.
 */

import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { countSets, parseSetScores } from '@/lib/matches/sets';
import { relativeDate } from '@/lib/ui/date';

type Props = {
  /** Joueur du haut (référence du set_scores). */
  topName: string;
  topAvatarUrl?: string | null;
  topColor?: string;
  /** Joueur du bas. */
  bottomName: string;
  bottomAvatarUrl?: string | null;
  bottomColor?: string;
  /** Détail des manches, vu du joueur du HAUT : "11-7,9-11,11-8". */
  setScores: string | null;
  /** Score agrégé "3-2" vu du joueur du haut (fallback si pas de détail). */
  score: string;
  /** Le vainqueur du match est-il le joueur du haut ? */
  topWon: boolean;
  ranked?: boolean;
  /** "BO7" | "BO5" | "BO3" */
  format?: string;
  /** Date ISO du match. */
  date?: string;
  onPress?: () => void;
  // Social (optionnel : si absent, le pied like/commentaire n'est pas affiché).
  likeCount?: number;
  liked?: boolean;
  commentCount?: number;
  onLike?: () => void;
  onComment?: () => void;
};

/** Une ligne joueur : avatar + nom + points par manche (séparés par des barres) + total. */
function PlayerRow({
  name,
  avatarUrl,
  color,
  points,
  isWinnerOf,
  setsWon,
  matchWinner,
}: {
  name: string;
  avatarUrl?: string | null;
  color: string;
  points: number[];
  /** Pour chaque manche : ce joueur l'a-t-il gagnée ? */
  isWinnerOf: boolean[];
  setsWon: number;
  matchWinner: boolean;
}) {
  return (
    <View style={styles.playerRow}>
      <Avatar name={name} size={28} uri={avatarUrl} color={color} />
      <ThemedText
        type={matchWinner ? 'cardTitle' : 'default'}
        themeColor={matchWinner ? 'text' : 'textSecondary'}
        numberOfLines={1}
        style={styles.name}>
        {name}
      </ThemedText>

      <View style={styles.setsCells}>
        {points.map((p, i) => (
          <View key={i} style={[styles.setCell, i > 0 && styles.setCellBar]}>
            <ThemedText
              type={isWinnerOf[i] ? 'cardTitle' : 'default'}
              themeColor={isWinnerOf[i] ? 'brand' : 'textMuted'}>
              {p}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.totalCell, matchWinner ? styles.totalWin : styles.totalLoss]}>
        <ThemedText type="cardTitle" themeColor={matchWinner ? 'onBrand' : 'textSecondary'}>
          {setsWon}
        </ThemedText>
      </View>
    </View>
  );
}

export const MatchScoreboard = memo(function MatchScoreboard({
  topName,
  topAvatarUrl,
  topColor = Palette.purple,
  bottomName,
  bottomAvatarUrl,
  bottomColor = Palette.blue,
  setScores,
  score,
  topWon,
  ranked,
  format,
  date,
  onPress,
  likeCount,
  liked,
  commentCount,
  onLike,
  onComment,
}: Props) {
  const showSocial = onLike != null || onComment != null;
  const sets = parseSetScores(setScores);
  const hasSets = sets.length > 0;

  // Manches gagnées : on privilégie le détail des manches, sinon on lit le score agrégé "3-2".
  const counted = countSets(sets);
  const [scoreA, scoreB] = score.split('-').map((n) => Number.parseInt(n, 10));
  const topSets = hasSets ? counted.a : Number.isFinite(scoreA) ? scoreA : topWon ? 1 : 0;
  const bottomSets = hasSets ? counted.b : Number.isFinite(scoreB) ? scoreB : topWon ? 0 : 1;

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      {/* En-tête : contexte du match */}
      <View style={styles.header}>
        <ThemedText type="label" themeColor="textSecondary">
          {ranked ? 'Classé' : 'Amical'}
          {format ? ` · ${format}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          {relativeDate(date)}
        </ThemedText>
      </View>

      {/* Tableau des manches */}
      {hasSets ? (
        <View style={styles.board}>
          <PlayerRow
            name={topName}
            avatarUrl={topAvatarUrl}
            color={topColor}
            points={sets.map((s) => s.a)}
            isWinnerOf={sets.map((s) => s.a > s.b)}
            setsWon={topSets}
            matchWinner={topWon}
          />
          <View style={styles.divider} />
          <PlayerRow
            name={bottomName}
            avatarUrl={bottomAvatarUrl}
            color={bottomColor}
            points={sets.map((s) => s.b)}
            isWinnerOf={sets.map((s) => s.b > s.a)}
            setsWon={bottomSets}
            matchWinner={!topWon}
          />
        </View>
      ) : (
        // Pas de détail des manches : on retombe sur le score simple.
        <View style={styles.board}>
          <View style={styles.simpleRow}>
            <Avatar name={topName} size={28} color={topColor} uri={topAvatarUrl} />
            <ThemedText type={topWon ? 'cardTitle' : 'default'} themeColor={topWon ? 'text' : 'textSecondary'} numberOfLines={1} style={styles.name}>
              {topName}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={topWon ? 'brand' : 'textMuted'}>
              {topSets}
            </ThemedText>
          </View>
          <View style={styles.divider} />
          <View style={styles.simpleRow}>
            <Avatar name={bottomName} size={28} color={bottomColor} uri={bottomAvatarUrl} />
            <ThemedText type={!topWon ? 'cardTitle' : 'default'} themeColor={!topWon ? 'text' : 'textSecondary'} numberOfLines={1} style={styles.name}>
              {bottomName}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={!topWon ? 'brand' : 'textMuted'}>
              {bottomSets}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Like + commentaire */}
      {showSocial ? (
        <View style={styles.social}>
          <Pressable style={styles.socialBtn} onPress={onLike} hitSlop={8} disabled={!onLike}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? Palette.redInk : Palette.grey} />
            <ThemedText type="smallBold" themeColor={liked ? 'danger' : 'textSecondary'}>
              {likeCount && likeCount > 0 ? `${likeCount} ace${likeCount > 1 ? 's' : ''}` : 'Ace'}
            </ThemedText>
          </Pressable>
          <Pressable style={styles.socialBtn} onPress={onComment} hitSlop={8} disabled={!onComment}>
            <Ionicons name="chatbubble-outline" size={19} color={Palette.grey} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              {commentCount && commentCount > 0 ? commentCount : 'Commenter'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  board: { gap: Spacing.two },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  simpleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1 },

  setsCells: { flexDirection: 'row', alignItems: 'center' },
  setCell: { width: 30, alignItems: 'center', justifyContent: 'center', paddingVertical: 1 },
  setCellBar: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Palette.border },

  totalCell: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.two,
  },
  totalWin: { backgroundColor: Palette.onyx },
  totalLoss: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Palette.border },

  social: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
    paddingTop: Spacing.two,
    marginTop: Spacing.half,
  },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
