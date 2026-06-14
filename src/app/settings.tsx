import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchMyProfile, updateMyProfile } from '@/lib/players/profile';

const STYLES = ['Offensif', 'Défensif', 'Allround'];
const HANDS = ['Droitier', 'Gaucher'];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [playStyle, setPlayStyle] = useState<string | null>(null);
  const [hand, setHand] = useState<string | null>(null);
  const [ffttPoints, setFfttPoints] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchMyProfile(id).then((p) => {
        if (!p) return;
        setDisplayName(p.display_name);
        setCity(p.city ?? '');
        setFfttPoints(p.fftt_points);
      });
    }, [session?.user?.id]),
  );

  async function save() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setBusy(true);
      await updateMyProfile(id, {
        display_name: displayName.trim() || 'Joueur',
        city: city.trim(),
        ...(playStyle ? { play_style: playStyle } : {}),
        ...(hand ? { handedness: hand } : {}),
      });
      Alert.alert('Profil mis à jour ✅');
      router.back();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Paramètres</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="smallBold" themeColor="textSecondary">
            PRÉNOM / PSEUDO
          </ThemedText>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Ton nom" placeholderTextColor={Palette.grey} />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            VILLE
          </ThemedText>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Paris" placeholderTextColor={Palette.grey} />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            STYLE DE JEU
          </ThemedText>
          <View style={styles.pillRow}>
            {STYLES.map((s) => (
              <Pressable key={s} onPress={() => setPlayStyle(s)} style={[styles.pill, playStyle === s ? styles.on : styles.off]}>
                <ThemedText type="smallBold" themeColor={playStyle === s ? 'onBrand' : 'text'}>
                  {s}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            MAIN DIRECTRICE
          </ThemedText>
          <View style={styles.pillRow}>
            {HANDS.map((h) => (
              <Pressable key={h} onPress={() => setHand(h)} style={[styles.pill, hand === h ? styles.on : styles.off]}>
                <ThemedText type="smallBold" themeColor={hand === h ? 'onBrand' : 'text'}>
                  {h}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.save, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                Enregistrer
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/link-fftt')}>
            <ThemedText type="cardTitle">Lier mon compte FFTT</ThemedText>
            <ThemedText type="smallBold" themeColor={ffttPoints ? 'brand' : 'textMuted'}>
              {ffttPoints ? `${ffttPoints} pts` : 'Lier'}
            </ThemedText>
          </Pressable>

          <View style={styles.accountInfo}>
            <ThemedText type="small" themeColor="textMuted">
              Connecté en tant que {session?.user?.email}
            </ThemedText>
          </View>

          <Pressable style={styles.signOut} onPress={() => signOut()}>
            <ThemedText type="cardTitle" themeColor="danger">
              Se déconnecter
            </ThemedText>
          </Pressable>
        </ScrollView>
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  lbl: { marginTop: Spacing.three },
  input: {
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  pillRow: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.sm, alignItems: 'center' },
  on: { backgroundColor: Palette.evergreen },
  off: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  save: {
    marginTop: Spacing.four,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    marginTop: Spacing.four,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountInfo: { marginTop: Spacing.four, alignItems: 'center' },
  signOut: { marginTop: Spacing.two, alignItems: 'center', padding: Spacing.three },
});
