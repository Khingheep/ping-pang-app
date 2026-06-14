import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { linkFfttToProfile, searchFftt, searchFfttLocal, type FfttPlayer } from '@/lib/fftt/link';

const SEXES: ('Hommes' | 'Femmes')[] = ['Hommes', 'Femmes'];

export default function LinkFfttScreen() {
  const { session } = useAuth();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [sexe, setSexe] = useState<'Hommes' | 'Femmes'>('Hommes');
  const [results, setResults] = useState<FfttPlayer[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);

  // Typeahead local (miroir) — débounce 250ms à chaque frappe.
  useEffect(() => {
    setOnline(false);
    const t = setTimeout(() => {
      searchFfttLocal({ nom, prenom, sexe })
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [nom, prenom, sexe]);

  async function searchOnline() {
    if (!nom.trim()) {
      Alert.alert('Recherche', 'Entre au moins un nom pour chercher en ligne.');
      return;
    }
    try {
      setOnlineLoading(true);
      const r = await searchFftt({ nom: nom.trim(), prenom: prenom.trim() || undefined, sexe });
      setResults(r);
      setOnline(true);
    } catch (e) {
      Alert.alert('FFTT', e instanceof Error ? e.message : 'Recherche en ligne impossible.');
    } finally {
      setOnlineLoading(false);
    }
  }

  async function link(p: FfttPlayer) {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setLinkingId(p.numberId);
      const pts = await linkFfttToProfile(id, p);
      Alert.alert('FFTT lié ✅', `${p.prenom} ${p.nom} — ${pts ?? '—'} pts officiels`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('FFTT', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Lier mon compte FFTT</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.form}>
            <View style={styles.sexRow}>
              {SEXES.map((s) => (
                <Pressable key={s} onPress={() => setSexe(s)} style={[styles.sexPill, sexe === s ? styles.on : styles.off]}>
                  <ThemedText type="smallBold" themeColor={sexe === s ? 'onBrand' : 'text'}>
                    {s}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Nom (tape 3 lettres)"
              placeholderTextColor={Palette.grey}
              value={nom}
              onChangeText={setNom}
              autoCapitalize="characters"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Prénom (optionnel)"
              placeholderTextColor={Palette.grey}
              value={prenom}
              onChangeText={setPrenom}
            />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLbl}>
              {online ? 'Résultats FFTT' : results.length ? 'Suggestions' : ' '}
            </ThemedText>

            {results.map((p) => (
              <View key={p.numberId} style={styles.card}>
                <View style={styles.cardMain}>
                  <ThemedText type="cardTitle">
                    {p.prenom} {p.nom}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {p.club?.nom ?? '—'}
                    {p.classementOfficiel ? ` · ${p.classementOfficiel}` : ''}
                    {p.pointsOfficiels != null ? ` · ${p.pointsOfficiels} pts` : ''}
                  </ThemedText>
                </View>
                <Pressable style={styles.linkBtn} disabled={linkingId !== null} onPress={() => link(p)}>
                  {linkingId === p.numberId ? (
                    <ActivityIndicator color={Palette.onyx} />
                  ) : (
                    <ThemedText type="smallBold" themeColor="brand">
                      Lier
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            ))}

            {nom.trim().length >= 2 && !online ? (
              <Pressable style={styles.onlineBtn} disabled={onlineLoading} onPress={searchOnline}>
                {onlineLoading ? (
                  <ActivityIndicator color={Palette.onyx} />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={18} color={Palette.onyx} />
                    <ThemedText type="smallBold">
                      {results.length ? 'Pas dans la liste ? Chercher sur FFTT' : 'Chercher sur FFTT (en ligne)'}
                    </ThemedText>
                  </>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
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
  form: { paddingHorizontal: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.two },
  sexRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.one },
  sexPill: { flex: 1, paddingVertical: Spacing.three, borderRadius: Radius.sm, alignItems: 'center' },
  on: { backgroundColor: Palette.evergreen },
  off: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  sectionLbl: { marginTop: Spacing.two, marginBottom: Spacing.one },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  cardMain: { flex: 1 },
  linkBtn: {
    backgroundColor: Palette.lime,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minWidth: 64,
    alignItems: 'center',
  },
  onlineBtn: {
    marginTop: Spacing.two,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
