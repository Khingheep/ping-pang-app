/**
 * Création d'un tournoi (Figma « Créer mon tournoi ») : nombre de joueurs (slider 4→64),
 * format, matchs de classement. À la création on obtient un code d'invitation et on est
 * redirigé vers le détail du tournoi.
 *
 * Le nombre de poules n'est PAS demandé : il est calculé automatiquement au lancement
 * selon les inscrits réels (numPoulesForPlayers) - poules de 3 à 5 et bracket propre.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { numPoulesForPlayers } from '@/lib/tournaments/bracket';
import { createTournament, TOURNAMENT_FORMATS, type TournamentFormat, type TournamentStructure } from '@/lib/tournaments/tournaments';
import { notify } from '@/lib/ui/alert';

// Formats réellement distincts. BO1 = match en 1 manche (formule express, ex. tournoi d'event).
const FORMATS: TournamentFormat[] = ['bo1', 'bo3', 'bo5', 'bo7'];
const PLAYER_MIN = 4;
const PLAYER_MAX = 64;
const PLAYER_STEP = 1;

const clampSize = (n: number) => Math.min(PLAYER_MAX, Math.max(PLAYER_MIN, n));

const QUALIFIERS: number[] = [1, 2, 3];

/** Aperçu de la structure : « 4 poules de 4 → 8 qualifiés ». */
function poulesPreview(n: number, qualifiers: number): string {
  const p = numPoulesForPlayers(n);
  const per = Math.round(n / p);
  const poulesLbl = p === 1 ? '1 poule' : `${p} poules`;
  const qualified = Math.min(qualifiers, per) * p;
  return `${poulesLbl} de ~${per} → ${qualified} qualifiés`;
}

/** Aperçu du tableau direct : « Tableau à 64 · 6 tours » (+ nb d'exempts si non-puissance de 2). */
function bracketPreview(n: number): string {
  let size = 1;
  while (size < n) size *= 2;
  const rounds = Math.round(Math.log2(size));
  const byes = size - n;
  return `Tableau à ${size}${byes ? ` · ${byes} exempt${byes > 1 ? 's' : ''}` : ''} · ${rounds} tour${rounds > 1 ? 's' : ''}`;
}

export default function NewTournamentScreen() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [size, setSize] = useState(8);
  const [format, setFormat] = useState<TournamentFormat>('bo5'); // format des poules (ou format unique en tableau direct)
  const [bracketFormat, setBracketFormat] = useState<TournamentFormat>('bo5'); // format du tableau final
  const [structure, setStructure] = useState<TournamentStructure>('poules');
  const [qualifiers, setQualifiers] = useState(2);
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingSize, setEditingSize] = useState(false);
  const [sizeDraft, setSizeDraft] = useState('');

  function commitSize() {
    const n = Number.parseInt(sizeDraft, 10);
    if (Number.isFinite(n)) setSize(clampSize(n));
    setEditingSize(false);
  }

  async function create() {
    const me = session?.user?.id;
    if (!me) return;
    try {
      setBusy(true);
      const t = await createTournament(me, {
        name: name.trim() || 'Mon tournoi',
        format,
        // Tableau direct : pas de poules → un seul format (le tableau reprend `format`).
        bracketFormat: structure === 'poules' ? bracketFormat : undefined,
        maxPlayers: size,
        qualifiersPerPoule: qualifiers,
        structure,
        isRanked: ranked,
        city: city.trim() || undefined,
      });
      router.replace({ pathname: '/tournoi', params: { id: t.id } });
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="close" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Créer mon tournoi</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            NOM DU TOURNOI
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Ex : Tournoi du dimanche"
            placeholderTextColor={Palette.grey}
            value={name}
            onChangeText={setName}
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            VILLE (OPTIONNEL)
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Ex : Paris"
            placeholderTextColor={Palette.grey}
            value={city}
            onChangeText={setCity}
          />

          <View style={styles.sliderHead}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              NOMBRE DE JOUEURS
            </ThemedText>
            <View style={styles.stepperRow}>
              <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => setSize((s) => clampSize(s - 1))}>
                <Ionicons name="remove" size={18} color={Palette.onyx} />
              </Pressable>
              {editingSize ? (
                <TextInput
                  style={styles.sizeInput}
                  value={sizeDraft}
                  onChangeText={(t) => setSizeDraft(t.replace(/[^0-9]/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                  maxLength={2}
                  onBlur={commitSize}
                  onSubmitEditing={commitSize}
                  returnKeyType="done"
                />
              ) : (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setSizeDraft(String(size));
                    setEditingSize(true);
                  }}>
                  <ThemedText type="title" themeColor="brand">
                    {size}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable style={styles.stepBtn} hitSlop={8} onPress={() => setSize((s) => clampSize(s + 1))}>
                <Ionicons name="add" size={18} color={Palette.onyx} />
              </Pressable>
            </View>
          </View>
          <PlayerSlider value={size} onChange={setSize} />
          <View style={styles.sliderScale}>
            <ThemedText type="small" themeColor="textSecondary">
              {PLAYER_MIN}
            </ThemedText>
            <ThemedText type="small" themeColor="brand">
              {structure === 'bracket' ? bracketPreview(size) : poulesPreview(size, qualifiers)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {PLAYER_MAX}
            </ThemedText>
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            FORMULE
          </ThemedText>
          <View style={styles.chipWrap}>
            {([['poules', 'Poules + tableau'], ['bracket', 'Tableau direct']] as const).map(([val, lbl]) => (
              <Pressable
                key={val}
                onPress={() => setStructure(val)}
                style={[styles.chipWide, structure === val ? styles.chipOn : styles.chipOff]}>
                <ThemedText type="smallBold" themeColor={structure === val ? 'onBrand' : 'text'}>
                  {lbl}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText type="small" themeColor="textMuted" style={{ marginTop: Spacing.one }}>
            {structure === 'bracket'
              ? 'Élimination directe, sans poules. Têtes de série par ELO (le n°1 et le n°2 ne se croisent qu’en finale).'
              : 'Round-robin en poules, puis tableau final avec les qualifiés.'}
          </ThemedText>

          {structure === 'poules' ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                FORMAT DES POULES
              </ThemedText>
              <FormatRow value={format} onChange={setFormat} />
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                FORMAT DU TABLEAU FINAL
              </ThemedText>
              <FormatRow value={bracketFormat} onChange={setBracketFormat} />
            </>
          ) : (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                FORMAT
              </ThemedText>
              <FormatRow value={format} onChange={setFormat} />
            </>
          )}

          {structure === 'poules' ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                QUALIFIÉS PAR POULE
              </ThemedText>
              <View style={styles.chipWrap}>
                {QUALIFIERS.map((q) => (
                  <Pressable key={q} onPress={() => setQualifiers(q)} style={[styles.chipWide, qualifiers === q ? styles.chipOn : styles.chipOff]}>
                    <ThemedText type="smallBold" themeColor={qualifiers === q ? 'onBrand' : 'text'}>
                      {q === 1 ? '1er' : q === 2 ? 'Top 2' : 'Top 3'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText type="small" themeColor="textMuted" style={{ marginTop: Spacing.one }}>
                Nombre de joueurs qui sortent de chaque poule vers le tableau final.
              </ThemedText>
            </>
          ) : null}

          <Pressable style={styles.rankedRow} onPress={() => setRanked((r) => !r)}>
            <View style={styles.rankedText}>
              <ThemedText type="cardTitle">Matchs de classement</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Les résultats comptent dans l’ELO des joueurs.
              </ThemedText>
            </View>
            <View style={[styles.toggle, ranked ? styles.toggleOn : styles.toggleOff]}>
              <View style={[styles.knob, ranked ? styles.knobOn : styles.knobOff]} />
            </View>
          </Pressable>
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={create}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Créer le tournoi
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

/** Rangée de chips de format (BO1/BO3/BO5/BO7) — réutilisée pour poules et tableau. */
function FormatRow({ value, onChange }: { value: TournamentFormat; onChange: (f: TournamentFormat) => void }) {
  return (
    <View style={styles.chipWrap}>
      {FORMATS.map((f) => (
        <Pressable key={f} onPress={() => onChange(f)} style={[styles.chipWide, value === f ? styles.chipOn : styles.chipOff]}>
          <ThemedText type="smallBold" themeColor={value === f ? 'onBrand' : 'text'}>
            {TOURNAMENT_FORMATS[f].label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/** Slider horizontal qui snap par paliers de PLAYER_STEP entre PLAYER_MIN et PLAYER_MAX. */
function PlayerSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const geom = useRef({ left: 0, width: 0 });
  const trackRef = useRef<View>(null);

  const snap = (raw: number) => {
    const steps = Math.round((raw - PLAYER_MIN) / PLAYER_STEP);
    return Math.min(PLAYER_MAX, Math.max(PLAYER_MIN, PLAYER_MIN + steps * PLAYER_STEP));
  };

  const setFromPageX = (pageX: number) => {
    const { left, width: w } = geom.current;
    if (w <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - left) / w));
    onChange(snap(PLAYER_MIN + ratio * (PLAYER_MAX - PLAYER_MIN)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Empêche le ScrollView parent de « voler » le geste en plein drag (sinon le pouce se bloque).
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        trackRef.current?.measureInWindow((x, _y, w) => {
          geom.current = { left: x, width: w };
          setFromPageX(pageX);
        });
      },
      onPanResponderMove: (_e, g) => setFromPageX(g.moveX),
    }),
  ).current;

  const ratio = (value - PLAYER_MIN) / (PLAYER_MAX - PLAYER_MIN);
  const THUMB = 26;
  const x = ratio * width;

  return (
    <View
      ref={trackRef}
      style={styles.sliderHit}
      onLayout={() => {
        trackRef.current?.measureInWindow((lx, _ly, w) => {
          geom.current = { left: lx, width: w };
          setWidth(w);
        });
      }}
      {...responder.panHandlers}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: x }]} />
      </View>
      <View style={[styles.sliderThumb, { left: x - THUMB / 2 }]} />
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  lbl: { marginTop: Spacing.four, marginBottom: Spacing.two },
  input: {
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chipWide: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, borderRadius: Radius.xs, alignItems: 'center' },

  // Slider nombre de joueurs (calqué sur la durée d'entraînement)
  sliderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.four, marginBottom: Spacing.two },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.white,
  },
  sizeInput: {
    minWidth: 44,
    textAlign: 'center',
    fontFamily: 'OpenSauceTwo-Black',
    fontSize: 22,
    color: Palette.onyx,
    paddingVertical: 0,
    paddingHorizontal: Spacing.one,
  },
  sliderScale: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.one },
  sliderHit: { height: 40, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: Palette.border, overflow: 'hidden' },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: Palette.onyx },
  sliderThumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.whitePP,
    borderWidth: 3,
    borderColor: Palette.onyx,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipOn: { backgroundColor: Palette.ink2 },
  chipOff: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.five,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  rankedText: { flex: 1, gap: Spacing.half },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: Palette.onyx },
  toggleOff: { backgroundColor: Palette.border },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.white },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
