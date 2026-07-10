import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  backfillFfttClub,
  fetchFfttByLicence,
  linkFfttToProfile,
  searchFftt,
  unlinkFfttFromProfile,
  type FfttDetail,
  type FfttPlayer,
} from '@/lib/fftt/link';
import { fetchMyProfile } from '@/lib/players/profile';
import { confirm, notify } from '@/lib/ui/alert';

export default function LinkFfttScreen() {
  const { session } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [results, setResults] = useState<FfttPlayer[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  // Compte déjà lié (le cas échéant) + son détail FFTT temps réel.
  const [linked, setLinked] = useState<{ ffttId: string; points: number | null } | null>(null);
  const [detail, setDetail] = useState<FfttDetail | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const loadLink = useCallback(() => {
    const id = session?.user?.id;
    if (!id) return;
    fetchMyProfile(id).then((p) => {
      if (p?.fftt_id) {
        setLinked({ ffttId: p.fftt_id, points: p.fftt_points });
        fetchFfttByLicence(p.fftt_id).then(setDetail).catch(() => {});
        // Comptes liés avant l'ajout de `fftt_club` : on remplit le club depuis le miroir local.
        if (!p.fftt_club) backfillFfttClub(id, p.fftt_id).catch(() => {});
      } else {
        setLinked(null);
        setDetail(null);
      }
    });
  }, [session?.user?.id]);

  useFocusEffect(loadLink);

  async function unlink() {
    const id = session?.user?.id;
    if (!id || !linked) return;
    const ok = await confirm({
      title: 'Délier mon compte FFTT ?',
      message: 'Tes points officiels ne seront plus affichés. Ton classement ELO dans l’app reste inchangé.',
      confirmText: 'Délier',
      destructive: true,
    });
    if (!ok) return;
    try {
      setUnlinking(true);
      await unlinkFfttFromProfile(id);
      setLinked(null);
      setDetail(null);
      notify('Compte FFTT délié');
    } catch (e) {
      notify('FFTT', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setUnlinking(false);
    }
  }

  async function search() {
    if (nom.trim().length < 2) {
      notify('Recherche', 'Entre au moins ton nom de famille.');
      return;
    }
    try {
      setLoading(true);
      const r = await searchFftt({ nom: nom.trim(), prenom: prenom.trim() || undefined });
      setResults(r);
      setSearched(true);
    } catch (e) {
      notify('FFTT', e instanceof Error ? e.message : 'Recherche impossible.');
    } finally {
      setLoading(false);
    }
  }

  async function link(p: FfttPlayer) {
    const id = session?.user?.id;
    if (!id) {
      notify('FFTT', 'Tu dois être connecté pour lier ton compte.');
      return;
    }
    try {
      setLinkingId(p.numberId);
      const pts = await linkFfttToProfile(id, p);
      notify('FFTT lié ✅', `${p.prenom} ${p.nom} - ${pts ?? '-'} pts officiels`);
      router.back();
    } catch (e) {
      notify('FFTT', e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Lier mon compte FFTT</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {linked ? (
            <View style={styles.linkedWrap}>
              <View style={styles.linkedCard}>
                <View style={styles.linkedTop}>
                  <Ionicons name="ribbon" size={22} color={Palette.onyx} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="cardTitle">
                      {detail?.prenom && detail?.nom ? `${detail.prenom} ${detail.nom}` : `Licence ${linked.ffttId}`}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      N° {linked.ffttId}
                      {detail?.classementMensuel ? ` · ${detail.classementMensuel}` : ''}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.linkedStats}>
                  <Stat label="Officiels" value={detail?.pointsOfficiels ?? linked.points} />
                  <Stat label="Temps réel" value={detail?.pointsTempsReel ?? null} />
                  <Stat label="Mensuels" value={detail?.pointsMensuels ?? null} />
                </View>
                <Pressable
                  style={[styles.unlinkBtn, unlinking && { opacity: 0.6 }]}
                  disabled={unlinking}
                  onPress={unlink}>
                  {unlinking ? (
                    <ActivityIndicator color={Palette.redInk} />
                  ) : (
                    <>
                      <Ionicons name="unlink" size={16} color={Palette.redInk} />
                      <ThemedText type="smallBold" themeColor="danger">
                        Délier mon compte
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.relinkLbl}>
                LIER UN AUTRE COMPTE
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              placeholderTextColor={Palette.grey}
              value={prenom}
              onChangeText={setPrenom}
              autoCapitalize="words"
              autoFocus={!linked}
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
                    {p.club?.nom ?? '-'}
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

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="cardTitle" themeColor="brand">
        {value != null ? value : '-'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  linkedWrap: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, gap: Spacing.three },
  linkedCard: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  linkedTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  linkedStats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
    paddingTop: Spacing.three,
  },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: Radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.red,
    backgroundColor: Palette.white,
  },
  relinkLbl: { marginTop: Spacing.one },
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
    backgroundColor: Palette.onyx,
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
