import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { ffttPointsToElo, levelForElo } from '@/lib/elo';
import { type FfttPlayer } from '@/lib/fftt/link';
import { takePendingFftt } from '@/lib/fftt/pending';
import { uploadAvatar } from '@/lib/players/avatar';
import { upsertOnboarding } from '@/lib/players/profile';

const TOTAL = 6;

const INTERESTS = [
  'Trouver des lieux pour jouer',
  'Suivre mes performances',
  'Faire progresser mon classement',
  "Rencontrer d'autres joueurs",
  'Battre mes collègues de bureau',
];

const PLAYER_TYPES = [
  { key: 'occasionnel', title: 'Occasionnel', sub: 'Je joue pour le plaisir, en vacances ou au bureau' },
  { key: 'regulier', title: 'Régulier', sub: 'Je joue souvent, pour passer un bon moment' },
  { key: 'competitif', title: 'Compétitif', sub: 'Chaque point compte' },
  { key: 'licencie', title: 'Licencié FFTT', sub: 'On récupère ton classement automatiquement' },
];

const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Autre'];

export default function OnboardingScreen() {
  const { session, signUpWithEmail, markOnboarded } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [playerType, setPlayerType] = useState<string | null>(null);

  // FFTT (si licencié) — la recherche se fait sur un écran dédié
  const [fftt, setFftt] = useState<FfttPlayer | null>(null);
  const [sexe, setSexe] = useState<'Hommes' | 'Femmes'>('Hommes');

  // finalisation
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('France');
  const [photo, setPhoto] = useState<string | null>(null);
  // identifiants de compte (collectés ici si pas encore connecté)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Au retour de l'écran de recherche FFTT : récupère le joueur choisi.
  useFocusEffect(
    useCallback(() => {
      const p = takePendingFftt();
      if (p) {
        setFftt(p);
        setPlayerType('licencie');
        setFirstName((cur) => cur || p.prenom || '');
        setLastName((cur) => cur || p.nom || '');
      }
    }, []),
  );

  // pré-remplit le prénom à l'arrivée sur la finalisation
  useEffect(() => {
    if (step === 4 && !firstName && name.trim()) setFirstName(name.trim());
  }, [step, name, firstName]);

  function toggleInterest(i: string) {
    setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo', 'Autorise l’accès aux photos pour ajouter un avatar.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri); // upload différé à la fin (après création du compte)
  }

  async function finish() {
    try {
      setSaving(true);
      // Crée le compte si on n'est pas déjà connecté (l'inscription se fait ICI, à la fin).
      let uid = session?.user?.id ?? null;
      const mail = session?.user?.email ?? email.trim();
      if (!uid) {
        uid = await signUpWithEmail(email.trim(), password);
        if (!uid) {
          Alert.alert('Inscription', 'Impossible de créer le compte (email déjà utilisé ?).');
          return;
        }
      }
      // Upload de la photo maintenant qu'on est authentifié.
      let avatar: string | undefined;
      if (photo) {
        try {
          avatar = await uploadAvatar(uid, photo);
        } catch {
          /* photo optionnelle */
        }
      }
      const display = `${firstName} ${lastName}`.trim() || name.trim() || 'Joueur';
      const patch: Parameters<typeof upsertOnboarding>[2] = {
        display_name: display,
        city: 'Paris',
        country,
        interests,
        ...(playerType ? { player_type: playerType } : {}),
        ...(avatar ? { avatar_url: avatar } : {}),
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
      await upsertOnboarding(uid, mail, patch);
      markOnboarded();
      router.replace('/');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  // À la finalisation, si pas connecté, l'email + un mot de passe ≥ 6 sont requis.
  const accountOk = !!session || (/.+@.+\..+/.test(email.trim()) && password.length >= 6);
  const canNext =
    step === 1
      ? name.trim().length >= 2
      : step === 4
        ? (firstName.trim() || name.trim()).length >= 1 && accountOk
        : true;
  const startElo = fftt && (fftt.pointsOfficiels ?? fftt.pointsMensuels) ? ffttPointsToElo((fftt.pointsOfficiels ?? fftt.pointsMensuels)!) : null;

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
            <View style={styles.welcome}>
              <View style={styles.logo}>
                <Ionicons name="tennisball" size={48} color={Palette.evergreen} />
              </View>
              <ThemedText type="title" style={styles.welcomeTitle}>
                Ping Pang Connect
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.welcomeSub}>
                Rassemble les pongistes autour d&apos;une même table.
              </ThemedText>
            </View>
          )}

          {step === 1 && (
            <>
              <ThemedText type="title">Avant de commencer, comment doit-on t&apos;appeler ?</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Paul…"
                placeholderTextColor={Palette.grey}
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </>
          )}

          {step === 2 && (
            <>
              <ThemedText type="title">Qu&apos;est-ce qui t&apos;intéresse le plus ?</ThemedText>
              <View style={styles.list}>
                {INTERESTS.map((i) => {
                  const on = interests.includes(i);
                  return (
                    <Pressable key={i} onPress={() => toggleInterest(i)} style={[styles.choice, on ? styles.choiceOn : styles.choiceOff]}>
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={on ? Palette.evergreen : Palette.grey}
                      />
                      <ThemedText type="cardTitle">{i}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <ThemedText type="title">Quel genre de pongiste es-tu ?</ThemedText>
              <View style={styles.list}>
                {PLAYER_TYPES.map((t) => {
                  const on = playerType === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setPlayerType(t.key)}
                      style={[styles.typeCard, on ? styles.typeOn : styles.typeOff]}>
                      <ThemedText type="cardTitle">{t.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t.sub}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {playerType === 'licencie' ? (
                <View style={styles.ffttBox}>
                  {fftt ? (
                    <View style={styles.linked}>
                      <Ionicons name="checkmark-circle" size={20} color={Palette.evergreen} />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="cardTitle">{fftt.prenom} {fftt.nom}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {fftt.club?.nom ?? ''}
                          {fftt.pointsOfficiels != null ? ` · ${fftt.pointsOfficiels} pts` : ''}
                          {startElo ? ` · ELO ${startElo}` : ''}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => setFftt(null)} hitSlop={8}>
                        <ThemedText type="smallBold" themeColor="danger">Changer</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        TU ES
                      </ThemedText>
                      <View style={styles.sexRow}>
                        {(['Hommes', 'Femmes'] as const).map((s) => (
                          <Pressable
                            key={s}
                            onPress={() => setSexe(s)}
                            style={[styles.sexPill, sexe === s ? styles.on : styles.off]}>
                            <ThemedText type="smallBold" themeColor={sexe === s ? 'onBrand' : 'text'}>
                              {s === 'Hommes' ? 'Un homme' : 'Une femme'}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        style={styles.ffttBtn}
                        onPress={() => router.push(`/link-fftt?onboarding=1&sexe=${sexe}`)}>
                        <Ionicons name="search" size={18} color={Palette.evergreen} />
                        <ThemedText type="cardTitle" themeColor="brand">
                          Trouver ma licence sur FFTT
                        </ThemedText>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : null}
            </>
          )}

          {step === 4 && (
            <>
              <ThemedText type="title">Finalisons ton compte</ThemedText>
              <Pressable style={styles.photo} onPress={pickPhoto}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoImg} contentFit="cover" />
                ) : (
                  <Ionicons name="add" size={28} color={Palette.grey} />
                )}
              </Pressable>
              <ThemedText type="small" themeColor="textMuted" style={{ textAlign: 'center' }}>
                Photo (optionnel)
              </ThemedText>

              <TextInput style={styles.input} placeholder="Prénom" placeholderTextColor={Palette.grey} value={firstName} onChangeText={setFirstName} />
              <TextInput style={styles.input} placeholder="Nom" placeholderTextColor={Palette.grey} value={lastName} onChangeText={setLastName} />
              {session?.user?.email ? (
                <View style={[styles.input, styles.readonly]}>
                  <ThemedText type="default" themeColor="textMuted">{session.user.email}</ThemedText>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="E-mail"
                    placeholderTextColor={Palette.grey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Mot de passe (min. 6 caractères)"
                    placeholderTextColor={Palette.grey}
                    secureTextEntry
                    autoCapitalize="none"
                    value={password}
                    onChangeText={setPassword}
                  />
                </>
              )}

              <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>PAYS</ThemedText>
              <View style={styles.countryRow}>
                {COUNTRIES.map((c) => (
                  <Pressable key={c} onPress={() => setCountry(c)} style={[styles.countryPill, country === c ? styles.on : styles.off]}>
                    <ThemedText type="smallBold" themeColor={country === c ? 'onBrand' : 'text'}>{c}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {step === 5 && (
            <View style={styles.welcome}>
              <View style={styles.logo}>
                <Ionicons name="happy" size={48} color={Palette.evergreen} />
              </View>
              <ThemedText type="title" style={styles.welcomeTitle}>
                Bienvenue !
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.welcomeSub}>
                Ton compte est prêt. Va t&apos;échauffer, c&apos;est bientôt à toi ! 🏓
              </ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 && step < TOTAL - 1 ? (
            <Pressable style={styles.back} onPress={() => setStep(step - 1)}>
              <ThemedText type="cardTitle">Retour</ThemedText>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Pressable
            style={[styles.next, !canNext && { opacity: 0.5 }]}
            disabled={saving || !canNext}
            onPress={() => (step < TOTAL - 1 ? setStep(step + 1) : finish())}>
            {saving ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                {step === 0 ? 'Commencer' : step < TOTAL - 1 ? 'Continuer' : "Entrer dans l'app 🏓"}
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
  dot: { height: 4, borderRadius: 2, flex: 1, marginHorizontal: Spacing.two },
  dotOn: { backgroundColor: Palette.evergreen },
  dotOff: { backgroundColor: Palette.border },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.five, gap: Spacing.two },
  welcome: { alignItems: 'center', paddingTop: Spacing.six, gap: Spacing.three },
  logo: { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { textAlign: 'center', marginTop: Spacing.three },
  welcomeSub: { textAlign: 'center' },
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
    marginTop: Spacing.two,
  },
  readonly: { justifyContent: 'center', backgroundColor: Palette.whitePP },
  list: { gap: Spacing.two, marginTop: Spacing.three },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  choiceOn: { backgroundColor: Palette.lime, borderColor: Palette.evergreen },
  choiceOff: { backgroundColor: Palette.white, borderColor: Palette.border },
  typeCard: { padding: Spacing.four, borderRadius: Radius.sm, borderWidth: 1, gap: Spacing.half },
  typeOn: { backgroundColor: Palette.lime, borderColor: Palette.evergreen },
  typeOff: { backgroundColor: Palette.white, borderColor: Palette.border },
  ffttBox: { marginTop: Spacing.three, gap: Spacing.two },
  sexRow: { flexDirection: 'row', gap: Spacing.two },
  sexPill: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.sm, alignItems: 'center' },
  ffttBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.evergreen,
  },
  linked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: Palette.lime, borderRadius: Radius.sm, padding: Spacing.three },
  sugg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  onlineRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
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
  photo: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
    overflow: 'hidden',
  },
  photoImg: { width: 96, height: 96, borderRadius: 48 },
  countryRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.two },
  countryPill: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderRadius: Radius.xs },
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
