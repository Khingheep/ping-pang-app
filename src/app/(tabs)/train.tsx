import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  addTrainingSession,
  fetchTrainingSessions,
  type TrainingKind,
  type TrainingSession,
} from '@/lib/training/sessions';

const KINDS: { key: TrainingKind; label: string }[] = [
  { key: 'match', label: 'Match' },
  { key: 'solo', label: 'Solo' },
  { key: 'jonglage', label: 'Jonglage' },
  { key: 'fitness', label: 'Fitness' },
];
const FEELINGS = ['💪', '🔥', '😅', '😐', '😩'];
const KIND_LABEL: Record<string, string> = { match: 'Match', solo: 'Solo', jonglage: 'Jonglage', fitness: 'Fitness' };

export default function TrainScreen() {
  const { session } = useAuth();
  const [kind, setKind] = useState<TrainingKind>('solo');
  const [duration, setDuration] = useState(30);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);

  const load = useCallback(() => {
    const id = session?.user?.id;
    if (id) fetchTrainingSessions(id).then(setSessions);
  }, [session?.user?.id]);

  useFocusEffect(load);

  async function save() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setBusy(true);
      await addTrainingSession({ playerId: id, kind, durationMin: duration, feeling, note: note || null });
      setNote('');
      setFeeling(null);
      load();
      Alert.alert('Séance enregistrée 🏓', `${KIND_LABEL[kind]} · ${duration} min`);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Entraînements</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
            Note tes séances, suis ta progression.
          </ThemedText>

          <View style={styles.card}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              TYPE
            </ThemedText>
            <View style={styles.pillRow}>
              {KINDS.map((k) => (
                <Pressable
                  key={k.key}
                  onPress={() => setKind(k.key)}
                  style={[styles.pill, kind === k.key ? styles.pillActive : styles.pillIdle]}>
                  <ThemedText type="smallBold" themeColor={kind === k.key ? 'onBrand' : 'text'}>
                    {k.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
              DURÉE
            </ThemedText>
            <View style={styles.durRow}>
              <Pressable style={styles.durBtn} onPress={() => setDuration(Math.max(15, duration - 15))}>
                <ThemedText type="cardTitle">−</ThemedText>
              </Pressable>
              <ThemedText type="subtitle">{duration} min</ThemedText>
              <Pressable style={styles.durBtn} onPress={() => setDuration(Math.min(240, duration + 15))}>
                <ThemedText type="cardTitle">+</ThemedText>
              </Pressable>
            </View>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
              FEELING
            </ThemedText>
            <View style={styles.pillRow}>
              {FEELINGS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFeeling(f)}
                  style={[styles.feeling, feeling === f && styles.feelingActive]}>
                  <ThemedText type="subtitle">{f}</ThemedText>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.note}
              placeholder="Note (optionnel)"
              placeholderTextColor={Palette.grey}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <Pressable style={[styles.save, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
              {busy ? (
                <ActivityIndicator color={Palette.whitePP} />
              ) : (
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Enregistrer la séance
                </ThemedText>
              )}
            </Pressable>
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Historique
          </ThemedText>
          {sessions.length === 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              Aucune séance enregistrée pour l&apos;instant.
            </ThemedText>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {sessions.map((s) => (
                <View key={s.id} style={styles.histRow}>
                  <ThemedText type="subtitle">{s.feeling ?? '🏓'}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle">
                      {KIND_LABEL[s.kind] ?? s.kind} · {s.duration_min} min
                    </ThemedText>
                    {s.note ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {s.note}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textMuted">
                    {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: BottomTabInset + Spacing.five },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.four },
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  lbl: { marginTop: Spacing.three },
  pillRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 64, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  pillActive: { backgroundColor: Palette.evergreen },
  pillIdle: { backgroundColor: Palette.whitePP, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  durRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.one },
  durBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feeling: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelingActive: { borderColor: Palette.evergreen, borderWidth: 2, backgroundColor: Palette.lime },
  note: {
    marginTop: Spacing.three,
    minHeight: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  save: {
    marginTop: Spacing.three,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
});
