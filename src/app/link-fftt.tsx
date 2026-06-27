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

export default function LinkFfttScreen() {
  const { session } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [results, setResults] = useState<FfttPlayer[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  async function search() {
    if (nom.trim().length < 2) {
      Alert.alert('Recherche', 'Entre au moins ton nom de famille.');
      return;
    }
    try {
      setLoading(true);
      const r = await searchFftt({ nom: nom.trim(), prenom: prenom.trim() || undefined });
      setResults(r);
      setSearched(true);
    } catch (e) {
      Alert.alert('FFTT', e instanceof Error ? e.message : 'Recherche impossible.');
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
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              placeholderTextColor={Palette.grey}
              value={prenom}
              onChangeText={setPrenom}
              autoCapitalize="words"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor={Palette.grey}
              value={nom}
              onChangeText={setNom}
              autoCapitalize="characters"
              onSubmitEditing={search}
              returnKeyType="search"
            />
            <Pressable style={[styles.searchBtn, loading && { opacity: 0.6 }]} disabled={loading} onPress={search}>
              {loading ? (
                <ActivityIndicator color={Palette.whitePP} />
              ) : (
                <>
                  <Ionicons name="search" size={18} color={Palette.whitePP} />
                  <ThemedText type="cardTitle" themeColor="onBrand">
                    Rechercher
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

            {searched && results.length === 0 && !loading ? (
              <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
                Aucune licence trouvée à ce nom. Vérifie l’orthographe.
              </ThemedText>
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
  form: { paddingHorizontal: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.three },
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
  searchBtn: {
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
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
  empty: { marginTop: Spacing.four, textAlign: 'center' },
});
