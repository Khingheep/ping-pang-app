import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/players/profile';

type Slot = { id: string; name: string } | null;
type Match = { a: Slot; b: Slot; winner: string | null };

function pairUp(players: { id: string; name: string }[]): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < players.length; i += 2) {
    matches.push({ a: players[i] ?? null, b: players[i + 1] ?? null, winner: null });
  }
  return matches;
}

export default function TournoiScreen() {
  const { session } = useAuth();
  const [pool, setPool] = useState<LeaderboardEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rounds, setRounds] = useState<Match[][] | null>(null);

  useEffect(() => {
    fetchLeaderboard(50).then(setPool);
  }, []);

  const chosen = pool.filter((p) => selected[p.id]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function start() {
    const players = chosen.map((p) => ({ id: p.id, name: p.display_name }));
    // taille puissance de 2 (4 ou 8)
    const size = players.length >= 8 ? 8 : 4;
    const seeds = players.slice(0, size);
    setRounds([pairUp(seeds)]);
  }

  function pick(roundIdx: number, matchIdx: number, winner: Slot) {
    if (!rounds || !winner) return;
    const next = rounds.map((r) => r.map((m) => ({ ...m })));
    next[roundIdx][matchIdx].winner = winner.id;
    // round complet ? générer le suivant
    const round = next[roundIdx];
    if (round.every((m) => m.winner) && round.length > 1) {
      const winners = round.map((m) => (m.winner === m.a?.id ? m.a : m.b)) as { id: string; name: string }[];
      if (!next[roundIdx + 1]) next.push(pairUp(winners));
    }
    setRounds(next);
  }

  const champion = (() => {
    if (!rounds) return null;
    const last = rounds[rounds.length - 1];
    if (last.length === 1 && last[0].winner) {
      const m = last[0];
      return m.winner === m.a?.id ? m.a : m.b;
    }
    return null;
  })();

  const roundName = (i: number, total: number) => {
    const fromEnd = total - i;
    if (fromEnd === 1) return 'Finale';
    if (fromEnd === 2) return 'Demi-finales';
    if (fromEnd === 3) return 'Quarts';
    return `Tour ${i + 1}`;
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Tournoi</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {!rounds ? (
            <>
              <ThemedText type="title">Créer un tournoi</ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                Sélectionne 4 ou 8 joueurs ({chosen.length} choisis).
              </ThemedText>
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                {pool.map((p) => {
                  const on = !!selected[p.id];
                  const me = p.id === session?.user?.id;
                  return (
                    <Pressable key={p.id} onPress={() => toggle(p.id)} style={[styles.pick, on && styles.pickOn]}>
                      <Avatar name={p.display_name} size={40} />
                      <ThemedText type="cardTitle" style={{ flex: 1 }}>
                        {p.display_name} {me ? '(toi)' : ''}
                      </ThemedText>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {p.elo}
                      </ThemedText>
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={on ? Palette.evergreen : Palette.border}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              {champion ? (
                <View style={styles.championCard}>
                  <ThemedText type="label" themeColor="textSecondary">
                    🏆 VAINQUEUR
                  </ThemedText>
                  <Avatar name={champion.name} size={72} color={Palette.lime} />
                  <ThemedText type="title">{champion.name}</ThemedText>
                </View>
              ) : (
                <ThemedText type="title">Bracket</ThemedText>
              )}

              {rounds.map((round, ri) => (
                <View key={ri} style={styles.roundBlock}>
                  <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
                    {roundName(ri, rounds.length)}
                  </ThemedText>
                  {round.map((m, mi) => (
                    <View key={mi} style={styles.matchCard}>
                      {[m.a, m.b].map((s, si) => {
                        const isWinner = s && m.winner === s.id;
                        const decided = !!m.winner;
                        return (
                          <Pressable
                            key={si}
                            disabled={!s || decided}
                            onPress={() => pick(ri, mi, s)}
                            style={[styles.slot, isWinner && styles.slotWin, si === 0 && styles.slotDivider]}>
                            <ThemedText type="cardTitle" themeColor={isWinner ? 'brand' : 'text'}>
                              {s?.name ?? '—'}
                            </ThemedText>
                            {isWinner ? <Ionicons name="checkmark" size={18} color={Palette.evergreen} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {!rounds ? (
          <Pressable
            style={[styles.cta, chosen.length < 4 && { opacity: 0.4 }]}
            disabled={chosen.length < 4}
            onPress={start}>
            <ThemedText type="cardTitle" themeColor="onBrand">
              Générer le bracket ({chosen.length >= 8 ? 8 : 4} joueurs)
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable style={styles.ctaOutline} onPress={() => setRounds(null)}>
            <ThemedText type="cardTitle">Nouveau tournoi</ThemedText>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  sub: { marginTop: Spacing.one },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  pickOn: { borderColor: Palette.evergreen, borderWidth: 2 },
  championCard: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.four, paddingVertical: Spacing.four },
  roundBlock: { marginTop: Spacing.two },
  section: { marginTop: Spacing.four, marginBottom: Spacing.two },
  matchCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    marginBottom: Spacing.two,
    overflow: 'hidden',
  },
  slot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three },
  slotDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.border },
  slotWin: { backgroundColor: Palette.lime },
  cta: {
    margin: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOutline: {
    margin: Spacing.four,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
