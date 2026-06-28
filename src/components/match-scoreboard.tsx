/**
 * Scoreboard d'un match, façon tableau de tennis de table : deux lignes (toi / adversaire),
 * une colonne par manche avec les points, et le total de manches gagnées mis en avant à droite.
 * Le gagnant de chaque manche a son score en surbrillance ; le vainqueur du match a un badge vert.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { countSets, parseSetScores } from '@/lib/matches/sets';

type Props = {
  /** Nom de l'adversaire (affiché en bas). */
  opponent: string;
  /** Nom du joueur courant (affiché en haut). */
  meName: string;
  meAvatarUrl?: string | null;
  oppAvatarUrl?: string | null;
  /** Détail des manches, vu de MON côté : "11-7,9-11,11-8". */
  setScores: string | null;
  /** Score agrégé "3-2" (fallback si pas de détail de manches). */
  score: string;
  won: boolean;
  delta?: number;
  ranked?: boolean;
  /** "WTT" | "Bo5" | "Bo3" */
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

function relativeDate(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Une ligne joueur : avatar + nom + points par manche + total de manches. */
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
          <View key={i} style={styles.setCell}>
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

export function MatchScoreboard({
  opponent,
  meName,
  meAvatarUrl,
  oppAvatarUrl,
  setScores,
  score,
  won,
  delta,
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
  const meSets = hasSets ? counted.a : Number.isFinite(scoreA) ? scoreA : won ? 1 : 0;
  const oppSets = hasSets ? counted.b : Number.isFinite(scoreB) ? scoreB : won ? 0 : 1;

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
            name={meName}
            avatarUrl={meAvatarUrl}
            color={Palette.purple}
            points={sets.map((s) => s.a)}
            isWinnerOf={sets.map((s) => s.a > s.b)}
            setsWon={meSets}
            matchWinner={won}
          />
          <View style={styles.divider} />
          <PlayerRow
            name={opponent}
            avatarUrl={oppAvatarUrl}
            color={Palette.blue}
            points={sets.map((s) => s.b)}
            isWinnerOf={sets.map((s) => s.b > s.a)}
            setsWon={oppSets}
            matchWinner={!won}
          />
        </View>
      ) : (
        // Pas de détail des manches : on retombe sur le score simple.
        <View style={styles.board}>
          <View style={styles.simpleRow}>
            <Avatar name={meName} size={28} color={Palette.purple} uri={meAvatarUrl} />
            <ThemedText type="cardTitle" numberOfLines={1} style={styles.name}>
              {meName}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={won ? 'brand' : 'textMuted'}>
              {meSets}
            </ThemedText>
          </View>
          <View style={styles.divider} />
          <View style={styles.simpleRow}>
            <Avatar name={opponent} size={28} color={Palette.blue} uri={oppAvatarUrl} />
            <ThemedText type="cardTitle" numberOfLines={1} style={styles.name}>
              {opponent}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={!won ? 'brand' : 'textMuted'}>
              {oppSets}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Pied : résultat + ELO */}
      <View style={styles.footer}>
        <View style={[styles.resultChip, { backgroundColor: won ? Palette.green : Palette.red }]}>
          <ThemedText type="smallBold" themeColor="text">
            {won ? 'Victoire' : 'Défaite'}
          </ThemedText>
        </View>
        {delta ? (
          <View style={[styles.deltaChip, { backgroundColor: delta > 0 ? Palette.lime : Palette.whitePP }]}>
            <ThemedText type="smallBold" themeColor={delta > 0 ? 'brand' : 'textMuted'}>
              {delta > 0 ? '+' : ''}
              {delta} ELO
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Like + commentaire */}
      {showSocial ? (
        <View style={styles.social}>
          <Pressable style={styles.socialBtn} onPress={onLike} hitSlop={8} disabled={!onLike}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? Palette.redInk : Palette.grey} />
            <ThemedText type="smallBold" themeColor={liked ? 'danger' : 'textSecondary'}>
              {likeCount && likeCount > 0 ? likeCount : "J'aime"}
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
}

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
  setCell: { width: 24, alignItems: 'center' },

  totalCell: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.one,
  },
  totalWin: { backgroundColor: Palette.evergreen },
  totalLoss: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Palette.border },

  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.half },
  resultChip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
  deltaChip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },

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
