import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { updateMyProfile } from '@/lib/players/profile';

const STYLES = ['Offensif', 'Défensif', 'Allround'];
const HANDS = ['Droitier', 'Gaucher'];
const GOALS = ['Compétition', 'Loisir', 'Progresser', 'Social'];
const TOTAL = 3;

function Chips({ options, value, onPick }: { options: string[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={[styles.chip, value === o ? styles.chipOn : styles.chipOff]}>
          <ThemedText type="smallBold" themeColor={value === o ? 'onBrand' : 'text'}>
            {o}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const { session, markOnboarded } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [city, setCity] = useState('Paris');
  const [style, setStyle] = useState<string | null>(null);
  const [hand, setHand] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setBusy(true);
      const patch: { city: string; play_style: string; handedness: string; display_name?: string } = {
        city: city.trim() || 'Paris',
        play_style: style ?? 'Allround',
        handedness: hand ?? 'Droitier',
      };
      if (name.trim()) patch.display_name = name.trim();
      await updateMyProfile(id, patch);
      markOnboarded();
      router.replace('/');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View key={i} style={[styles.dot, i <= step ? styles.dotOn : styles.dotOff]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <ThemedText type="title">Bienvenue 👋</ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                Quelques infos pour personnaliser ton profil.
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                PRÉNOM / PSEUDO
              </ThemedText>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ton nom" placeholderTextColor={Palette.grey} />
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                VILLE
              </ThemedText>
              <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Paris" placeholderTextColor={Palette.grey} />
            </>
          )}

          {step === 1 && (
            <>
              <ThemedText type="title">Ton style de jeu</ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                STYLE
              </ThemedText>
              <Chips options={STYLES} value={style} onPick={setStyle} />
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                MAIN DIRECTRICE
              </ThemedText>
              <Chips options={HANDS} value={hand} onPick={setHand} />
            </>
          )}

          {step === 2 && (
            <>
              <ThemedText type="title">Tes objectifs</ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                Qu&apos;est-ce qui t&apos;amène sur Ping Pang ?
              </ThemedText>
              <Chips options={GOALS} value={goal} onPick={setGoal} />
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 ? (
            <Pressable style={styles.back} onPress={() => setStep(step - 1)}>
              <ThemedText type="cardTitle">Retour</ThemedText>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable
            style={styles.next}
            disabled={busy}
            onPress={() => (step < TOTAL - 1 ? setStep(step + 1) : finish())}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                {step < TOTAL - 1 ? 'Continuer' : "C'est parti 🏓"}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  dots: { flexDirection: 'row', gap: Spacing.one, justifyContent: 'center', paddingTop: Spacing.three },
  dot: { height: 4, borderRadius: 2, flex: 1, marginHorizontal: Spacing.four },
  dotOn: { backgroundColor: Palette.evergreen },
  dotOff: { backgroundColor: Palette.border },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.five },
  sub: { marginTop: Spacing.one },
  lbl: { marginTop: Spacing.four },
  input: {
    height: 54,
    marginTop: Spacing.two,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  chip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: Radius.pill },
  chipOn: { backgroundColor: Palette.evergreen },
  chipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  footer: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.four },
  back: {
    flex: 1,
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  next: { flex: 2, height: 54, borderRadius: Radius.sm, backgroundColor: Palette.evergreen, alignItems: 'center', justifyContent: 'center' },
});
