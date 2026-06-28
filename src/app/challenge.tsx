import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { notify } from '@/lib/ui/alert';
import {
  challengePreview,
  FORMAT_INFO,
  sendChallenge,
  type ChallengeFormat,
} from '@/lib/social/challenges';

const FORMATS: ChallengeFormat[] = ['bo3', 'bo5', 'bo7', 'wtt', 'champions'];

export default function ChallengeScreen() {
  const { opponentId, opponentName, opponentElo, opponentCity } = useLocalSearchParams<{
    opponentId?: string;
    opponentName?: string;
    opponentElo?: string;
    opponentCity?: string;
  }>();
  const { session } = useAuth();
  const [format, setFormat] = useState<ChallengeFormat>('wtt');
  const [preview, setPreview] = useState<{ winDelta: number; lossDelta: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (opponentId) challengePreview(opponentId).then(setPreview);
  }, [opponentId]);

  const info = FORMAT_INFO[format];
  const win = preview?.winDelta ?? 0;
  const loss = preview?.lossDelta ?? 0;
  const stake = Math.round((Math.abs(win) + Math.abs(loss)) / 2);

  async function send() {
    const me = session?.user?.id;
    if (!me || !opponentId) return;
    try {
      setBusy(true);
      await sendChallenge(me, opponentId, format);
      setSent(true);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  // ── Confirmation (DÉFIS-04) ──
  if (sent) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.flex, styles.center]}>
          <View style={styles.bang}>
            <ThemedText type="metric" style={{ color: Palette.evergreen, fontSize: 40 }}>
              !
            </ThemedText>
          </View>
          <ThemedText type="title" style={{ marginTop: Spacing.four }}>
            Défi envoyé !
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
            vs {opponentName ?? 'ton adversaire'} · Format {info.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted" style={{ marginTop: Spacing.two }}>
            {opponentName ?? 'Ton adversaire'} a 48h pour accepter.
          </ThemedText>

          <View style={styles.stakeCard}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ELO EN JEU
            </ThemedText>
            <ThemedText type="subtitle" themeColor="brand">
              ± {stake} points
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              +{win} si tu gagnes · {loss} si tu perds
            </ThemedText>
          </View>

          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ThemedText type="cardTitle">Retour aux défis</ThemedText>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ── Sélection du format (DÉFIS-03) ──
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Défier</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="title">Défier {opponentName ?? ''}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
            {opponentElo ? `ELO ${opponentElo}` : ''}
            {opponentCity ? ` · ${opponentCity}` : ''}
          </ThemedText>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            CHOISIS TON FORMAT
          </ThemedText>

          {/* Carte héro du format sélectionné */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <ThemedText type="title" style={{ color: Palette.whitePP }}>
                  {info.title}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: Palette.lime }}>
                  {info.tag.toUpperCase()}
                </ThemedText>
              </View>
              {format === 'wtt' ? (
                <View style={styles.reco}>
                  <ThemedText type="smallBold" themeColor="brand">
                    Recommandé
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText type="metric" style={styles.heroDelta}>
              +{win}
            </ThemedText>
            <ThemedText type="small" style={{ color: Palette.whitePP, opacity: 0.8 }}>
              ELO max · {info.detail}
            </ThemedText>
          </View>

          {/* Sélecteur de format */}
          <View style={styles.formatRow}>
            {FORMATS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFormat(f)}
                style={[styles.fPill, format === f ? styles.fActive : styles.fIdle]}>
                <ThemedText type="smallBold" themeColor={format === f ? 'onBrand' : 'text'}>
                  {FORMAT_INFO[f].title}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={styles.stakeInline}>
            <ThemedText type="small" themeColor="textSecondary">
              ELO en jeu : <ThemedText type="smallBold" themeColor="brand">± {stake} points</ThemedText> ({loss} si défaite)
            </ThemedText>
          </View>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={send}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Envoyer le défi
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  lbl: { marginTop: Spacing.five, marginBottom: Spacing.two },
  heroCard: { backgroundColor: Palette.evergreen, borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.one },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reco: { backgroundColor: Palette.lime, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
  heroDelta: { color: Palette.lime, fontSize: 56, lineHeight: 60, marginTop: Spacing.two },
  formatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  fPill: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, borderRadius: Radius.xs, alignItems: 'center' },
  fActive: { backgroundColor: Palette.evergreen },
  fIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  stakeInline: { marginTop: Spacing.three },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bang: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stakeCard: {
    marginTop: Spacing.five,
    alignSelf: 'stretch',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.one,
    alignItems: 'center',
  },
  backBtn: {
    marginTop: Spacing.five,
    alignSelf: 'stretch',
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
