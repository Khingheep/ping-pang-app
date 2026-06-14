import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { ffttPointsToElo, levelForElo } from '@/lib/elo';
import { searchFftt, searchFfttLocal, type FfttPlayer } from '@/lib/fftt/link';
import { updateMyProfile } from '@/lib/players/profile';

const STYLES = ['Offensif', 'Défensif', 'Allround'];
const HANDS = ['Droitier', 'Gaucher'];
const GOALS = ['Compétition', 'Loisir', 'Progresser', 'Social'];
const TOTAL = 5;

function Chips({ options, value, onPick }: { options: string[]; value: string | null; onPick: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={[styles.chip, value === o ? styles.chipOn : styles.chipOff]}>
          <ThemedText type="cardTitle" themeColor={value === o ? 'onBrand' : 'text'}>
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
  const [saving, setSaving] = useState(false);

  // étape 1 — nom + FFTT
  const [name, setName] = useState('');
  const [fftt, setFftt] = useState<FfttPlayer | null>(null);
  const [results, setResults] = useState<FfttPlayer[]>([]);
  const [sexe, setSexe] = useState<'Hommes' | 'Femmes'>('Hommes');
  const [online, setOnline] = useState(false);
  // étape 2 — ville
  const [city, setCity] = useState('');
  const [locating, setLocating] = useState(false);
  // étapes 3-5
  const [hand, setHand] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);

  // typeahead local pendant la frappe du nom
  useEffect(() => {
    if (step !== 0 || fftt) return;
    const t = setTimeout(() => {
      searchFfttLocal({ nom: name }).then(setResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [name, step, fftt]);

  function pickFftt(p: FfttPlayer) {
    setFftt(p);
    setName(`${p.prenom} ${p.nom}`);
    setResults([]);
  }

  async function searchOnline() {
    if (name.trim().length < 2) return;
    try {
      setOnline(true);
      const r = await searchFftt({ nom: name.trim(), sexe });
      setResults(r);
    } catch (e) {
      Alert.alert('FFTT', e instanceof Error ? e.message : 'Recherche impossible.');
    } finally {
      setOnline(false);
    }
  }

  async function locate() {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Position', 'Permission refusée — tu peux entrer ta ville à la main.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const c = geo[0]?.city ?? geo[0]?.subregion ?? geo[0]?.region ?? '';
      if (c) setCity(c);
      else Alert.alert('Position', 'Ville introuvable, entre-la à la main.');
    } catch {
      Alert.alert('Position', 'Impossible de récupérer ta position.');
    } finally {
      setLocating(false);
    }
  }

  async function finish() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setSaving(true);
      const patch: Parameters<typeof updateMyProfile>[1] = {
        display_name: name.trim() || 'Joueur',
        city: city.trim() || 'Paris',
        play_style: style ?? 'Allround',
        handedness: hand ?? 'Droitier',
      };
      if (fftt) {
        patch.fftt_id = fftt.numberId;
        const pts = fftt.pointsOfficiels ?? fftt.pointsMensuels ?? null;
        patch.fftt_points = pts;
        if (pts) {
          const e = ffttPointsToElo(pts);
          patch.elo = e;
          patch.level = levelForElo(e).key;
        }
      }
      await updateMyProfile(id, patch);
      markOnboarded();
      router.replace('/');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  const startElo = fftt && (fftt.pointsOfficiels ?? fftt.pointsMensuels) ? ffttPointsToElo(fftt.pointsOfficiels ?? fftt.pointsMensuels!) : null;

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
              <ThemedText type="title">Comment tu t&apos;appelles ?</ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                Licencié·e FFTT ? Choisis-toi dans la liste pour démarrer avec ton vrai classement.
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Ton nom"
                placeholderTextColor={Palette.grey}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (fftt) setFftt(null);
                }}
                autoFocus
              />

              {fftt ? (
                <View style={styles.linked}>
                  <Ionicons name="checkmark-circle" size={20} color={Palette.evergreen} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle">Licence FFTT liée</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {fftt.club?.nom ?? ''}
                      {fftt.pointsOfficiels != null ? ` · ${fftt.pointsOfficiels} pts` : ''}
                      {startElo ? ` · ELO de départ ${startElo}` : ''}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => setFftt(null)} hitSlop={8}>
                    <ThemedText type="smallBold" themeColor="danger">
                      Changer
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <>
                  {results.map((p) => (
                    <Pressable key={p.numberId} style={styles.sugg} onPress={() => pickFftt(p)}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="cardTitle">
                          {p.prenom} {p.nom}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {p.club?.nom ?? '—'}
                          {p.pointsOfficiels != null ? ` · ${p.pointsOfficiels} pts` : ''}
                        </ThemedText>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={Palette.evergreen} />
                    </Pressable>
                  ))}
                  {name.trim().length >= 2 && (
                    <View style={styles.onlineRow}>
                      <View style={styles.sexMini}>
                        {(['Hommes', 'Femmes'] as const).map((s) => (
                          <Pressable
                            key={s}
                            onPress={() => setSexe(s)}
                            style={[styles.sexMiniPill, sexe === s ? styles.on : styles.off]}>
                            <ThemedText type="smallBold" themeColor={sexe === s ? 'onBrand' : 'text'}>
                              {s === 'Hommes' ? 'H' : 'F'}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable style={styles.onlineBtn} disabled={online} onPress={searchOnline}>
                        {online ? (
                          <ActivityIndicator color={Palette.onyx} />
                        ) : (
                          <ThemedText type="smallBold">Chercher sur FFTT</ThemedText>
                        )}
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <ThemedText type="title">Tu joues où ?</ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                Pour te trouver des joueurs et des tables près de toi.
              </ThemedText>
              <Pressable style={styles.geoBtn} disabled={locating} onPress={locate}>
                {locating ? (
                  <ActivityIndicator color={Palette.whitePP} />
                ) : (
                  <>
                    <Ionicons name="location" size={20} color={Palette.whitePP} />
                    <ThemedText type="cardTitle" themeColor="onBrand">
                      Utiliser ma position
                    </ThemedText>
                  </>
                )}
              </Pressable>
              <TextInput
                style={styles.input}
                placeholder="Ou entre ta ville"
                placeholderTextColor={Palette.grey}
                value={city}
                onChangeText={setCity}
              />
            </>
          )}

          {step === 2 && (
            <>
              <ThemedText type="title">Tu es droitier ou gaucher ?</ThemedText>
              <Chips options={HANDS} value={hand} onPick={setHand} />
            </>
          )}

          {step === 3 && (
            <>
              <ThemedText type="title">Ton style de jeu ?</ThemedText>
              <Chips options={STYLES} value={style} onPick={setStyle} />
            </>
          )}

          {step === 4 && (
            <>
              <ThemedText type="title">Qu&apos;est-ce qui t&apos;amène sur Ping Pang ?</ThemedText>
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
            disabled={saving}
            onPress={() => (step < TOTAL - 1 ? setStep(step + 1) : finish())}>
            {saving ? (
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
  dot: { height: 4, borderRadius: 2, flex: 1, marginHorizontal: Spacing.three },
  dotOn: { backgroundColor: Palette.evergreen },
  dotOff: { backgroundColor: Palette.border },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.five, gap: Spacing.two },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.three },
  input: {
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 16,
  },
  linked: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.lime,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  sugg: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  onlineRow: { marginTop: Spacing.three, flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  sexMini: { flexDirection: 'row', gap: Spacing.half },
  sexMiniPill: { width: 40, paddingVertical: Spacing.two, borderRadius: Radius.xs, alignItems: 'center' },
  onlineBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.xs,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  geoBtn: {
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  chips: { gap: Spacing.two, marginTop: Spacing.three },
  chip: { paddingVertical: Spacing.four, borderRadius: Radius.sm, alignItems: 'center' },
  chipOn: { backgroundColor: Palette.evergreen },
  chipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  on: { backgroundColor: Palette.evergreen },
  off: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
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
