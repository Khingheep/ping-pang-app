import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchMyProfile, updateMyProfile, updatePrefs, type AccountPrefs } from '@/lib/players/profile';
import { supabase } from '@/lib/supabase/client';

const STYLES = ['Offensif', 'Défensif', 'Allround'];
const HANDS = ['Droitier', 'Gaucher'];

const PRIVACY: { key: keyof AccountPrefs; label: string }[] = [
  { key: 'profile_public', label: 'Profil public' },
  { key: 'stats_visible', label: 'Stats visibles' },
  { key: 'visible_on_map', label: 'Visible sur la map' },
  { key: 'share_elo', label: 'Partager mon ELO' },
];
const NOTIFS: { key: keyof AccountPrefs; label: string }[] = [
  { key: 'notif_challenges', label: 'Nouveaux défis' },
  { key: 'notif_results', label: 'Résultats' },
];
const DEFAULT_PREFS: AccountPrefs = {
  profile_public: true,
  stats_visible: true,
  visible_on_map: true,
  share_elo: true,
  notif_challenges: true,
  notif_results: true,
};

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [playStyle, setPlayStyle] = useState<string | null>(null);
  const [hand, setHand] = useState<string | null>(null);
  const [ffttPoints, setFfttPoints] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<AccountPrefs>(DEFAULT_PREFS);
  const [newPwd, setNewPwd] = useState('');
  const [pwdOpen, setPwdOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const id = session?.user?.id;
      if (!id) return;
      fetchMyProfile(id).then((p) => {
        if (!p) return;
        setDisplayName(p.display_name);
        setCity(p.city ?? '');
        setFfttPoints(p.fftt_points);
        setPlayStyle(p.play_style);
        setHand(p.handedness);
        setPrefs({
          profile_public: p.profile_public,
          stats_visible: p.stats_visible,
          visible_on_map: p.visible_on_map,
          share_elo: p.share_elo,
          notif_challenges: p.notif_challenges,
          notif_results: p.notif_results,
        });
      });
    }, [session?.user?.id]),
  );

  function toggle(key: keyof AccountPrefs, value: boolean) {
    const id = session?.user?.id;
    setPrefs((cur) => ({ ...cur, [key]: value }));
    if (id) updatePrefs(id, { [key]: value }).catch(() => {});
  }

  async function changePassword() {
    if (newPwd.length < 6) {
      Alert.alert('Mot de passe trop court', 'Au moins 6 caractères.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) Alert.alert('Erreur', error.message);
    else {
      setNewPwd('');
      setPwdOpen(false);
      Alert.alert('Mot de passe mis à jour ✅');
    }
  }

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

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Confidentialité
          </ThemedText>
          <View style={styles.group}>
            {PRIVACY.map((row, i) => (
              <View key={row.key} style={[styles.toggleRow, i > 0 && styles.divider]}>
                <ThemedText type="cardTitle">{row.label}</ThemedText>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => toggle(row.key, v)}
                  trackColor={{ true: Palette.evergreen, false: Palette.border }}
                  thumbColor={Palette.whitePP}
                />
              </View>
            ))}
          </View>

          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.section}>
            Notifications
          </ThemedText>
          <View style={styles.group}>
            {NOTIFS.map((row, i) => (
              <View key={row.key} style={[styles.toggleRow, i > 0 && styles.divider]}>
                <ThemedText type="cardTitle">{row.label}</ThemedText>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => toggle(row.key, v)}
                  trackColor={{ true: Palette.evergreen, false: Palette.border }}
                  thumbColor={Palette.whitePP}
                />
              </View>
            ))}
          </View>

          <Pressable style={styles.linkRow} onPress={() => setPwdOpen((o) => !o)}>
            <ThemedText type="cardTitle">Changer le mot de passe</ThemedText>
            <Ionicons name={pwdOpen ? 'chevron-up' : 'chevron-forward'} size={18} color={Palette.grey} />
          </Pressable>
          {pwdOpen ? (
            <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
              <TextInput
                style={styles.input}
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="Nouveau mot de passe"
                placeholderTextColor={Palette.grey}
                secureTextEntry
                autoCapitalize="none"
              />
              <Pressable style={styles.save} onPress={changePassword}>
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Valider le mot de passe
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

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
  section: { marginTop: Spacing.five, marginBottom: Spacing.two },
  group: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.four,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.border },
});
