import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { linkFfttToProfile, searchFftt, type FfttPlayer } from '@/lib/fftt/link';

const SEXES: ('Hommes' | 'Femmes')[] = ['Hommes', 'Femmes'];

export default function LinkFfttScreen() {
  const { session } = useAuth();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [licence, setLicence] = useState('');
  const [sexe, setSexe] = useState<'Hommes' | 'Femmes'>('Hommes');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FfttPlayer[] | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  async function runSearch() {
    if (!nom.trim() && !licence.trim()) {
      Alert.alert('Recherche', 'Entre au moins un nom ou un numéro de licence.');
      return;
    }
    try {
      setLoading(true);
      setResults(null);
      const r = await searchFftt({
        nom: nom.trim() || undefined,
        prenom: prenom.trim() || undefined,
        licence: licence.trim() || undefined,
        sexe,
      });
      setResults(r);
    } catch (e) {
      Alert.alert('FFTT', e instanceof Error ? e.message : 'Erreur de recherche.');
    } finally {
      setLoading(false);
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
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sexRow}>
              {SEXES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSexe(s)}
                  style={[styles.sexPill, sexe === s ? styles.on : styles.off]}>
                  <ThemedText type="smallBold" themeColor={sexe === s ? 'onBrand' : 'text'}>
                    {s}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <TextInput style={styles.input} placeholder="Nom" placeholderTextColor={Palette.grey} value={nom} onChangeText={setNom} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder="Prénom (optionnel)" placeholderTextColor={Palette.grey} value={prenom} onChangeText={setPrenom} />
            <ThemedText type="small" themeColor="textMuted" style={styles.or}>
              ou par numéro de licence
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="N° de licence (optionnel)"
              placeholderTextColor={Palette.grey}
              value={licence}
              onChangeText={setLicence}
              keyboardType="number-pad"
            />

            <Pressable style={styles.searchBtn} disabled={loading} onPress={runSearch}>
              {loading ? (
                <ActivityIndicator color={Palette.whitePP} />
              ) : (
                <ThemedText type="cardTitle" themeColor="onBrand">
                  Rechercher
                </ThemedText>
              )}
            </Pressable>

            {results !== null && (
              <View style={styles.results}>
                {results.length === 0 ? (
                  <ThemedText type="small" themeColor="textMuted">
                    Aucun joueur trouvé. Vérifie le nom et le sexe sélectionné.
                  </ThemedText>
                ) : (
                  results.map((p) => (
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
                  ))
                )}
              </View>
            )}
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  sexRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
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
  or: { textAlign: 'center', marginVertical: Spacing.one },
  searchBtn: {
    marginTop: Spacing.two,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: { marginTop: Spacing.four, gap: Spacing.two },
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
});
