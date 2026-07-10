import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { saveMatchFeedback } from '@/lib/matches/feedback';
import { fetchMyProfile } from '@/lib/players/profile';

const FEELINGS = ['😩', '😐', '🙂', '😄', '🔥'];

export default function PostMatchScreen() {
  const { matchId, won, delta, opponentName, score } = useLocalSearchParams<{
    matchId?: string;
    won?: string;
    delta?: string;
    opponentName?: string;
    score?: string;
  }>();
  const { session } = useAuth();
  const [feeling, setFeeling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [newElo, setNewElo] = useState<number | null>(null);

  const d = Number(delta ?? 0);
  const isWin = won === 'true';

  useEffect(() => {
    const id = session?.user?.id;
    if (id) fetchMyProfile(id).then((p) => setNewElo(p?.elo ?? null));
  }, [session?.user?.id]);

  async function validate() {
    const id = session?.user?.id;
    if (id && matchId) await saveMatchFeedback(matchId, id, feeling, note.trim() || null).catch(() => {});
    router.back();
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title">Match terminé !</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
            vs {opponentName ?? 'ton adversaire'}
            {score ? ` · ${score}` : ''} · {isWin ? 'Victoire' : 'Défaite'}
          </ThemedText>

          <View style={styles.deltaCard}>
            <ThemedText type="metric" style={[styles.deltaBig, { color: d >= 0 ? Palette.lime : Palette.whitePP }]}>
              {d > 0 ? '+' : ''}
              {d}
            </ThemedText>
            <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.85 }}>
              ELO{newElo != null ? ` · ${newElo - d} → ${newElo}` : ''}
            </ThemedText>
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            COMMENT TU T&apos;ES SENTI ?
          </ThemedText>
          <View style={styles.feelRow}>
            {FEELINGS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFeeling(f)}
                style={[styles.feel, feeling === f && styles.feelOn]}>
                <ThemedText type="subtitle">{f}</ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            NOTES SUR LE MATCH
          </ThemedText>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder="Ce qui a marché, ce qu'il faut bosser…"
            placeholderTextColor={Palette.grey}
            multiline
          />
        </ScrollView>

        <View style={styles.actions}>
          <Pressable style={styles.skip} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ThemedText type="cardTitle" themeColor="textSecondary">
              Passer
            </ThemedText>
          </Pressable>
          <Pressable style={styles.validate} onPress={validate}>
            <ThemedText type="cardTitle" themeColor="onBrand">
              Valider
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.five, paddingBottom: Spacing.five },
  deltaCard: {
    marginTop: Spacing.four,
    backgroundColor: Palette.onyx,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'flex-start',
  },
  deltaBig: { fontSize: 52, lineHeight: 56 },
  lbl: { marginTop: Spacing.five, marginBottom: Spacing.two },
  feelRow: { flexDirection: 'row', gap: Spacing.two },
  feel: {
    flex: 1,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelOn: { borderColor: Palette.onyx, borderWidth: 2, backgroundColor: Palette.lime },
  note: {
    minHeight: 96,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.four },
  skip: {
    flex: 1,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validate: {
    flex: 2,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
