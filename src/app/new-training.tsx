import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { fetchPartnerCandidates, type PartnerCandidate } from '@/lib/social/friends';
import {
  addTrainingSession,
  EXERCISES_BANK,
  FEELINGS,
  fetchSessionTemplates,
  formatDuration,
  MAX_SESSION_PHOTOS,
  PARTNER_LEVELS,
  partnersLabel,
  STROKES,
  STROKES_PREVIEW_COUNT,
  uploadSessionPhotos,
  type SessionTemplate,
} from '@/lib/training/sessions';
import { notify } from '@/lib/ui/alert';
import {
  distanceKm,
  fetchVenues,
  foldText,
  nearestVenue,
  suggestVenue,
  type Venue,
} from '@/lib/venues/venues';

const DUR_MIN = 15; // 15 min
const DUR_MAX = 180; // 3h
const DUR_STEP = 15; // paliers de 15 min

// Style par ressenti : emoji + couleur (dégradé rouge → evergreen), teinte de fond du
// cran sélectionné, couleur de libellé (contraste sur blanc). La valeur stockée reste le
// mot FR - cf. FEELINGS.
const FEELING_STYLE: Record<string, { emoji: string; color: string; tint: string; ink: string }> = {
  Difficile: { emoji: '😣', color: '#E5674F', tint: '#FBE7E1', ink: '#C7492F' },
  Moyen: { emoji: '😐', color: '#EFA94A', tint: '#FAEEDC', ink: '#C9821A' },
  Bien: { emoji: '🙂', color: '#A7CF63', tint: '#EDF5DC', ink: '#5E9A34' },
  Excellent: { emoji: '🤩', color: Palette.onyx, tint: '#DFE8E4', ink: Palette.onyx },
};

// Flow « ajouter une séance » façon onboarding (frame Figma Paul) : les questions
// s'enchaînent une par une. Ordre validé avec Paul :
// 1. Ce qu'on a travaillé → 2. Durée → 3. Description (après la durée, plus logique) →
// 4. Ressenti (jauge) → 5. « Dis-nous en plus » (lieu + partenaire + match + photo).
const STEP = { WORK: 0, DURATION: 1, DESCRIPTION: 2, FEELING: 3, MORE: 4 } as const;
const STEP_COUNT = 5;

const STEP_TITLES: Record<number, { title: string; sub: string }> = {
  [STEP.WORK]: { title: 'Qu’as-tu travaillé ?', sub: 'Choisis tes exercices ou tes coups techniques.' },
  [STEP.DURATION]: { title: 'Combien de temps ?', sub: 'La durée totale de ta séance.' },
  [STEP.DESCRIPTION]: { title: 'Donne une description à ta séance', sub: 'Un mot d’ordre ou un titre (optionnel).' },
  [STEP.FEELING]: { title: 'Comment t’es-tu senti pendant la séance ?', sub: 'Ton ressenti global.' },
  [STEP.MORE]: { title: 'Dis-nous en plus !', sub: 'Lieu, partenaire et photo souvenir (optionnel).' },
};

export default function NewTrainingScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ template?: string; stroke?: string }>();
  // « Qu'as-tu travaillé ? » est la 1ʳᵉ étape (un ?stroke= pré-coche juste un coup).
  const [step, setStep] = useState<number>(STEP.WORK);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [showAllStrokes, setShowAllStrokes] = useState(false);
  const [workQuery, setWorkQuery] = useState(''); // recherche exos/coups à l'étape « Qu'as-tu travaillé ? »
  const [duration, setDuration] = useState(60);
  const [partner, setPartner] = useState<string | null>(null);
  const [partnerElo, setPartnerElo] = useState('');
  const [candidates, setCandidates] = useState<PartnerCandidate[]>([]);
  const [partnerPlayers, setPartnerPlayers] = useState<PartnerCandidate[]>([]); // plusieurs partenaires taggés
  const [partnerQuery, setPartnerQuery] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [customVenue, setCustomVenue] = useState<string | null>(null); // lieu tapé à la main, hors base
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [isSolo, setIsSolo] = useState(false);
  const [hadMatch, setHadMatch] = useState(false); // « as-tu fait un match ? » — stocké pour les stats de saison
  const [photos, setPhotos] = useState<string[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const appliedTemplate = useRef(false);
  const appliedStroke = useRef(false);

  useEffect(() => {
    fetchVenues().then(setVenues);
  }, []);

  // Arrivée depuis la banque d'exercices avec ?stroke=<coup> : pré-coche ce coup.
  useEffect(() => {
    if (appliedStroke.current || !params.stroke) return;
    const s = params.stroke;
    if (!STROKES.includes(s)) return;
    setStrokes((cur) => (cur.includes(s) ? cur : [...cur, s]));
    if (STROKES.indexOf(s) >= STROKES_PREVIEW_COUNT) setShowAllStrokes(true);
    appliedStroke.current = true;
  }, [params.stroke]);

  // Arrivée depuis l'onglet avec ?template=<id> : on pré-remplit une fois que lieux,
  // candidats et modèles sont chargés (sinon le lieu/partenaire ne se retrouvent pas).
  useEffect(() => {
    if (appliedTemplate.current || !params.template) return;
    if (!templates.length || !venues.length) return;
    const t = templates.find((x) => x.id === params.template);
    if (!t) return;
    applyTemplate(t);
    appliedTemplate.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.template, templates, venues, candidates]);

  useEffect(() => {
    const id = session?.user?.id;
    if (id) {
      fetchPartnerCandidates(id).then(setCandidates).catch(() => {});
      fetchSessionTemplates(id).then(setTemplates).catch(() => {});
    }
  }, [session?.user?.id]);

  // Auto-détection du lieu à l'ouverture, UNIQUEMENT si la permission est déjà
  // accordée (ne déclenche jamais le popup iOS - ça reste réservé au bouton).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      const list = venues.length ? venues : await fetchVenues();
      if (cancelled || !list.length) return;
      await snapToNearest(list, { silent: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venues]);

  async function pickPhoto() {
    const remaining = MAX_SESSION_PHOTOS - photos.length;
    if (remaining <= 0) {
      notify('Photos', `${MAX_SESSION_PHOTOS} photos maximum par séance.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Photo', 'Autorise l’accès aux photos pour illustrer ta séance.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8, // compression réelle (resize + JPEG) faite à l'upload
    });
    if (res.canceled || !res.assets.length) return;
    setPhotos((cur) => [...cur, ...res.assets.map((a) => a.uri)].slice(0, MAX_SESSION_PHOTOS));
  }

  /** Récupère la position et sélectionne le lieu connu le plus proche. */
  async function snapToNearest(list: Venue[], opts: { silent?: boolean } = {}) {
    const { silent = false } = opts;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); // sert au tri par distance + à géolocaliser un lieu proposé
    const near = nearestVenue(pos.coords.latitude, pos.coords.longitude, list);
    if (!near) {
      if (!silent) notify('Position', 'Aucun lieu connu à proximité.');
      return;
    }
    if (silent) {
      // Auto-remplissage : seulement si tu es vraiment sur place (< 400 m), sinon on
      // laisse vide plutôt que de proposer un terrain où tu n'as pas joué. Et on
      // n'écrase jamais un lieu déjà choisi par l'utilisateur.
      if (near.distanceKm <= 0.4) setVenue((cur) => cur ?? near.venue);
      return;
    }
    setVenue(near.venue);
    setQuery('');
    if (near.distanceKm > 1) {
      notify(
        'Lieu le plus proche',
        `${near.venue.name} - à ${near.distanceKm.toFixed(1)} km. Change-le si ce n’est pas le bon.`,
      );
    }
  }

  async function useMyLocation() {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        notify('Position', 'Autorise l’accès à ta position pour détecter le lieu le plus proche.');
        return;
      }
      const list = venues.length ? venues : await fetchVenues();
      await snapToNearest(list);
    } catch {
      notify('Position', 'Impossible de récupérer ta position. Réessaie ou choisis le lieu à la main.');
    } finally {
      setLocating(false);
    }
  }

  const matches = useMemo(() => {
    const q = foldText(query.trim());
    if (!q) return [];
    const hits = venues
      .filter((v) => foldText(v.name).includes(q))
      .map((v) => ({
        venue: v,
        distanceKm: coords && v.lat != null && v.lng != null ? distanceKm(coords.lat, coords.lng, v.lat, v.lng) : null,
      }));
    // Trié par distance quand on connaît la position, sinon par ordre alphabétique (déjà le cas).
    if (coords) hits.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return hits.slice(0, 6);
  }, [query, venues, coords]);

  const partnerMatches = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    const taggedIds = new Set(partnerPlayers.map((p) => p.id)); // on ne re-propose pas un joueur déjà taggé
    // Sans recherche, on propose juste les premiers (amis en tête grâce au tri).
    const base = (q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates).filter(
      (c) => !taggedIds.has(c.id),
    );
    return base.slice(0, 3);
  }, [partnerQuery, candidates, partnerPlayers]);

  // Recherche « Qu'as-tu travaillé ? » : filtre exos + coups (insensible aux accents), les
  // chips se réorganisent tout seuls (flex-wrap). Vide → liste normale (preview + « voir tout »).
  const workQ = foldText(workQuery.trim());
  const exerciseResults = useMemo(
    () => (workQ ? EXERCISES_BANK.filter((s) => foldText(s).includes(workQ)) : EXERCISES_BANK),
    [workQ],
  );
  const strokeResults = useMemo(() => {
    if (workQ) return STROKES.filter((s) => foldText(s).includes(workQ));
    return showAllStrokes ? STROKES : STROKES.filter((s, i) => i < STROKES_PREVIEW_COUNT || strokes.includes(s));
  }, [workQ, showAllStrokes, strokes]);

  function addPartnerPlayer(c: PartnerCandidate) {
    setPartnerPlayers((cur) => (cur.some((p) => p.id === c.id) ? cur : [...cur, c]));
    setPartner(null); // un vrai joueur prime sur le niveau générique
    setPartnerElo('');
    setPartnerQuery('');
  }
  function removePartnerPlayer(id: string) {
    setPartnerPlayers((cur) => cur.filter((p) => p.id !== id));
  }

  /** Pré-remplit le flow à partir d'une séance passée (note & photo restent vides) et saute à la fin. */
  function applyTemplate(t: SessionTemplate) {
    setStrokes(t.strokes);
    setShowAllStrokes(t.strokes.some((s) => STROKES.indexOf(s) >= STROKES_PREVIEW_COUNT));
    setDuration(t.durationMin);
    setFeeling(t.feeling);
    setIsSolo(t.isSolo);

    // Partenaires : vrais joueurs > ELO précis > niveau générique.
    if (t.isSolo || (!t.partners.length && !t.partnerLevel)) {
      setPartnerPlayers([]);
      setPartner(null);
      setPartnerElo('');
    } else if (t.partners.length) {
      setPartnerPlayers(
        t.partners.map((pp) => ({
          id: pp.id,
          name: pp.name,
          avatarUrl: pp.avatarUrl,
          isFriend: candidates.find((c) => c.id === pp.id)?.isFriend ?? false,
        })),
      );
      setPartner(null);
      setPartnerElo('');
    } else if (t.partnerLevel?.startsWith('ELO ')) {
      setPartnerElo(t.partnerLevel.slice(4).trim());
      setPartner(null);
      setPartnerPlayers([]);
    } else {
      setPartner(t.partnerLevel);
      setPartnerElo('');
      setPartnerPlayers([]);
    }

    // Lieu : on retrouve le lieu en base via son id, sinon on retombe sur un lieu libre.
    const known = t.venueId ? venues.find((v) => v.id === t.venueId) ?? null : null;
    if (known) {
      setVenue(known);
      setCustomVenue(null);
    } else if (t.venueName) {
      setVenue(null);
      setCustomVenue(t.venueName);
    } else {
      setVenue(null);
      setCustomVenue(null);
    }

    setQuery('');
    setPartnerQuery('');
    // Tout est pré-rempli → on saute directement au dernier écran avant l'envoi.
    setStep(STEP.MORE);
  }

  function toggleStroke(s: string) {
    setStrokes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function save() {
    const id = session?.user?.id;
    if (!id) return;
    try {
      setBusy(true);
      let photoUrls: string[] = [];
      if (photos.length) {
        // photos optionnelles : si l'upload échoue, on enregistre quand même la séance.
        photoUrls = await uploadSessionPhotos(id, photos);
      }
      // Lieu tapé à la main (hors base) : on le pousse aussi dans la file de relecture dev.
      if (!venue && customVenue) await suggestVenue(id, customVenue, coords);
      await addTrainingSession({
        playerId: id,
        durationMin: duration,
        strokes,
        // Niveau/ELO générique seulement en repli : dès qu'un vrai joueur est taggé, il prime.
        partnerLevel: isSolo || partnerPlayers.length ? null : partnerElo.trim() ? `ELO ${partnerElo.trim()}` : partner,
        partnerIds: isSolo ? [] : partnerPlayers.map((p) => p.id),
        venueId: venue?.id ?? null,
        venueLabel: venue ? null : customVenue,
        feeling,
        note: note.trim() || null,
        photoUrls,
        isSolo,
        hadMatch,
      });
      const failed = photos.length - photoUrls.length;
      const durLabel = duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? duration % 60 : ''}` : `${duration} min`;
      const photoWarn =
        failed > 0
          ? `\n\n⚠️ ${failed} photo${failed > 1 ? 's' : ''} n'${failed > 1 ? 'ont' : 'a'} pas pu être ajoutée${failed > 1 ? 's' : ''} (problème de réseau ?). La séance est bien enregistrée, tu pourras réessayer.`
          : '';
      notify('Séance enregistrée 🏓', `${durLabel} de jeu, bien joué !${photoWarn}`);
      router.back();
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  const isLast = step === STEP.MORE;
  // Seule contrainte du flow : dire ce qu'on a travaillé (exo ou coup). Le reste est optionnel.
  const canNext = step === STEP.WORK ? strokes.length > 0 : true;

  function back() {
    if (step > 0) setStep(step - 1);
    else router.back();
  }
  function next() {
    if (!canNext) return;
    if (isLast) void save();
    else setStep(step + 1);
  }

  const heading = STEP_TITLES[step];

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {/* Bouton retour présent sur chaque écran : revient à l'étape précédente,
              ou ferme l'écran depuis la première étape. */}
          <Pressable onPress={back} hitSlop={12} disabled={busy} style={styles.backBtn}>
            <Ionicons name={step > 0 ? 'arrow-back' : 'chevron-back'} size={22} color={Palette.onyx} />
            <ThemedText type="smallBold">{step > 0 ? 'Retour' : 'Fermer'}</ThemedText>
          </Pressable>
          <ThemedText type="cardTitle">Noter un entraînement</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {step + 1}/{STEP_COUNT}
          </ThemedText>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEP_COUNT) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.question}>
            {heading.title}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.questionSub}>
            {heading.sub}
          </ThemedText>

          {step === STEP.DESCRIPTION ? (
            <TextInput
              style={styles.descNote}
              placeholder="Séance de reprise avant la rentrée…"
              placeholderTextColor={Palette.grey}
              value={note}
              onChangeText={setNote}
              multiline
            />
          ) : null}

          {step === STEP.WORK ? (
            <>
              {templates.length > 0 && !workQ ? (
                <>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.lbl, { marginTop: 0 }]}>
                    RÉPÉTER UNE SÉANCE
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tplRow}>
                    {templates.map((t) => {
                      const partnerLabel = t.isSolo ? 'Solo' : partnersLabel(t) ?? t.partnerLevel ?? null;
                      return (
                        <Pressable key={t.id} style={styles.tplCard} onPress={() => applyTemplate(t)}>
                          <View style={styles.tplHead}>
                            <ThemedText type="cardTitle" themeColor="brand">
                              {formatDuration(t.durationMin)}
                            </ThemedText>
                            <Ionicons name="repeat" size={16} color={Palette.onyx} />
                          </View>
                          <ThemedText type="small" numberOfLines={2}>
                            {t.strokes.length ? t.strokes.join(', ') : 'Séance'}
                          </ThemedText>
                          {(partnerLabel || t.venueName) ? (
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {[partnerLabel, t.venueName].filter(Boolean).join(' · ')}
                            </ThemedText>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {/* Recherche : filtre exos + coups, les chips se réorganisent tout seuls (flex-wrap). */}
              <View style={[styles.searchWrap, templates.length && !workQ ? { marginTop: Spacing.four } : null]}>
                <Ionicons name="search" size={18} color={Palette.grey} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher un exercice ou un coup"
                  placeholderTextColor={Palette.grey}
                  value={workQuery}
                  onChangeText={setWorkQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {workQuery.length > 0 ? (
                  <Pressable onPress={() => setWorkQuery('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color={Palette.grey} />
                  </Pressable>
                ) : null}
              </View>

              {exerciseResults.length > 0 ? (
                <>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                    EXERCICES
                  </ThemedText>
                  <View style={styles.wrap}>
                    {exerciseResults.map((s) => (
                      <Chip key={s} label={s} active={strokes.includes(s)} onPress={() => toggleStroke(s)} color={Palette.ink2} />
                    ))}
                  </View>
                </>
              ) : null}

              {strokeResults.length > 0 ? (
                <>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                    COUPS TECHNIQUES
                  </ThemedText>
                  <View style={styles.wrap}>
                    {strokeResults.map((s) => (
                      <Chip key={s} label={s} active={strokes.includes(s)} onPress={() => toggleStroke(s)} color={Palette.purple} />
                    ))}
                  </View>
                  {!workQ && STROKES.length > STROKES_PREVIEW_COUNT ? (
                    <Pressable style={styles.seeAll} onPress={() => setShowAllStrokes((v) => !v)} hitSlop={8}>
                      <ThemedText type="smallBold" themeColor="brand">
                        {showAllStrokes ? 'Voir moins' : 'Voir tout'}
                      </ThemedText>
                      <Ionicons
                        name={showAllStrokes ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Palette.onyx}
                      />
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {workQ && exerciseResults.length === 0 && strokeResults.length === 0 ? (
                <View style={styles.workEmpty}>
                  <Ionicons name="search-outline" size={24} color={Palette.grey} />
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                    Aucun exercice ni coup pour « {workQuery.trim()} ». Essaie un autre mot.
                  </ThemedText>
                </View>
              ) : null}
            </>
          ) : null}

          {step === STEP.DURATION ? (
            <>
              <View style={styles.durRow}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  DURÉE
                </ThemedText>
                <ThemedText type="cardTitle" themeColor="brand">
                  {formatDuration(duration)}
                </ThemedText>
              </View>
              <DurationSlider value={duration} onChange={setDuration} />
              <View style={styles.durScale}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDuration(DUR_MIN)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDuration(DUR_MAX)}
                </ThemedText>
              </View>
            </>
          ) : null}

          {step === STEP.FEELING ? (
            <View style={styles.feelingWrap}>
              <FeelingScale value={feeling} onChange={(f) => setFeeling(feeling === f ? null : f)} />
            </View>
          ) : null}

          {step === STEP.MORE ? (
            <>
              {/* ── Où as-tu joué ? ── */}
              <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.lbl, { marginTop: 0 }]}>
                OÙ AS-TU JOUÉ ?
              </ThemedText>
              {venue || customVenue ? (
                <View style={styles.selectedVenue}>
                  <Ionicons name={customVenue ? 'flag' : 'location'} size={16} color={Palette.onyx} />
                  <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {venue?.name ?? customVenue}
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      setVenue(null);
                      setCustomVenue(null);
                    }}
                    hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={Palette.grey} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
                    {locating ? (
                      <ActivityIndicator size="small" color={Palette.onyx} />
                    ) : (
                      <Ionicons name="locate" size={18} color={Palette.onyx} />
                    )}
                    <ThemedText type="smallBold" themeColor="brand">
                      {locating ? 'Localisation…' : 'Me localiser'}
                    </ThemedText>
                  </Pressable>
                  <TextInput
                    style={styles.search}
                    placeholder="Rechercher un lieu (optionnel)"
                    placeholderTextColor={Palette.grey}
                    value={query}
                    onChangeText={setQuery}
                  />
                  {matches.map(({ venue: v, distanceKm: d }) => (
                    <Pressable
                      key={v.id}
                      style={styles.match}
                      onPress={() => {
                        setVenue(v);
                        setQuery('');
                      }}>
                      <Ionicons name={v.indoor ? 'home' : 'sunny'} size={16} color={Palette.grey} />
                      <ThemedText type="default" style={{ flex: 1 }} numberOfLines={1}>
                        {v.name}
                      </ThemedText>
                      {d != null ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  ))}
                  {query.trim() && matches.length === 0 ? (
                    <Pressable
                      style={styles.match}
                      onPress={() => {
                        setCustomVenue(query.trim());
                        setQuery('');
                      }}>
                      <Ionicons name="add-circle-outline" size={16} color={Palette.onyx} />
                      <ThemedText type="default" style={{ flex: 1 }} numberOfLines={1}>
                        Utiliser « {query.trim()} »
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Nouveau lieu
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </>
              )}

              {/* ── Avec qui ? ── */}
              <Pressable style={[styles.soloRow, { marginTop: Spacing.four }]} onPress={() => setIsSolo((v) => !v)}>
                <ThemedText type="cardTitle">Session seul</ThemedText>
                <View style={[styles.checkbox, isSolo && styles.checkboxOn]}>
                  {isSolo ? <Ionicons name="checkmark" size={16} color={Palette.whitePP} /> : null}
                </View>
              </Pressable>

              {!isSolo ? (
                <>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                    TAG TON/TES PARTENAIRE(S)
                  </ThemedText>

                  {/* Joueurs déjà taggés : pastilles supprimables (on peut en ajouter autant qu'on veut). */}
                  {partnerPlayers.length > 0 ? (
                    <View style={styles.tagWrap}>
                      {partnerPlayers.map((p) => (
                        <View key={p.id} style={styles.tagChip}>
                          <Avatar name={p.name} uri={p.avatarUrl} size={22} />
                          <ThemedText type="smallBold" numberOfLines={1} style={styles.tagChipTxt}>
                            {p.name}
                          </ThemedText>
                          <Pressable onPress={() => removePartnerPlayer(p.id)} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={Palette.grey} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <TextInput
                    style={[styles.search, partnerPlayers.length > 0 && { marginTop: Spacing.two }]}
                    placeholder={
                      partnerPlayers.length ? 'Ajouter un autre joueur' : 'Rechercher un joueur Panger'
                    }
                    placeholderTextColor={Palette.grey}
                    value={partnerQuery}
                    onChangeText={setPartnerQuery}
                  />
                  {partnerMatches.map((c) => (
                    <Pressable key={c.id} style={styles.match} onPress={() => addPartnerPlayer(c)}>
                      <Avatar name={c.name} uri={c.avatarUrl} size={28} />
                      <ThemedText type="default" style={{ flex: 1 }} numberOfLines={1}>
                        {c.name}
                      </ThemedText>
                      {c.isFriend ? (
                        <View style={styles.friendBadge}>
                          <ThemedText type="small" themeColor="brand">
                            Ami
                          </ThemedText>
                        </View>
                      ) : null}
                    </Pressable>
                  ))}

                  {/* Repli niveau/ELO : uniquement tant qu'aucun vrai joueur n'est taggé. */}
                  {partnerPlayers.length === 0 ? (
                    <>
                      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                        OU JUSTE LE NIVEAU
                      </ThemedText>
                      <View style={styles.wrap}>
                        {PARTNER_LEVELS.map((p) => (
                          <Chip
                            key={p}
                            label={p}
                            active={partner === p}
                            onPress={() => {
                              setPartner(partner === p ? null : p);
                              setPartnerElo(''); // niveau et ELO sont exclusifs
                            }}
                            color={Palette.lime}
                          />
                        ))}
                      </View>
                      <TextInput
                        style={[styles.search, { marginTop: Spacing.two }]}
                        placeholder="Ou son ELO précis (ex : 1450)"
                        placeholderTextColor={Palette.grey}
                        value={partnerElo}
                        onChangeText={(t) => {
                          setPartnerElo(t.replace(/[^0-9]/g, ''));
                          setPartner(null); // un ELO saisi prime sur les niveaux génériques
                        }}
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {/* ── Match d'entraînement ? (stocké pour les stats de saison, pas dans le feed) ── */}
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                TU AS FAIT UN MATCH D’ENTRAÎNEMENT ?
              </ThemedText>
              <View style={styles.wrap}>
                <Chip label="Oui" active={hadMatch} onPress={() => setHadMatch(true)} grow color={Palette.lime} />
                <Chip label="Non" active={!hadMatch} onPress={() => setHadMatch(false)} grow color={Palette.lime} />
              </View>

              {/* ── Photo souvenir ── */}
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                RAJOUTE UNE PHOTO SOUVENIR (OPTIONNEL · {MAX_SESSION_PHOTOS} MAX)
              </ThemedText>
              {photos.length ? (
                <View style={styles.photoGrid}>
                  {photos.map((uri, i) => (
                    <View key={uri} style={styles.photoThumbWrap}>
                      <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
                      <Pressable
                        style={styles.photoRemove}
                        onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}
                        hitSlop={8}>
                        <Ionicons name="close-circle" size={24} color={Palette.whitePP} />
                      </Pressable>
                    </View>
                  ))}
                  {photos.length < MAX_SESSION_PHOTOS ? (
                    <Pressable style={styles.photoAddTile} onPress={pickPhoto}>
                      <Ionicons name="add" size={28} color={Palette.onyx} />
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Pressable style={styles.photoAdd} onPress={pickPhoto}>
                  <Ionicons name="camera-outline" size={22} color={Palette.onyx} />
                  <ThemedText type="smallBold" themeColor="brand">
                    Ajouter une photo
                  </ThemedText>
                </Pressable>
              )}

              {/* Récap rapide avant l'envoi (tout reste modifiable via la flèche retour). */}
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                RÉCAP
              </ThemedText>
              <View style={styles.recap}>
                <ThemedText type="small" numberOfLines={2}>
                  {strokes.length ? strokes.join(', ') : 'Séance'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[
                    formatDuration(duration),
                    isSolo
                      ? 'Solo'
                      : partnerPlayers.length
                        ? partnerPlayers.map((p) => p.name).join(', ')
                        : partnerElo
                          ? `ELO ${partnerElo}`
                          : partner,
                    venue?.name ?? customVenue ?? null,
                    feeling,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
            </>
          ) : null}
        </ScrollView>

        <Pressable
          style={[styles.submit, (busy || !canNext) && { opacity: 0.6 }]}
          disabled={busy || !canNext}
          onPress={next}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              {isLast ? 'Enregistrer la séance' : 'Continuer'}
            </ThemedText>
          )}
        </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  grow,
  compact,
  color = Palette.ink2,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  grow?: boolean;
  compact?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        grow && { flex: 1 },
        active ? { backgroundColor: color, borderColor: color } : styles.chipIdle,
      ]}>
      <ThemedText
        type="smallBold"
        themeColor={active && color === Palette.ink2 ? 'onBrand' : 'text'}
        numberOfLines={1}
        style={compact && styles.chipTextCompact}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

// Échelle de ressenti horizontale : le pattern éprouvé « rate your session » (une rangée
// d'emojis + libellé, du plus dur au meilleur, tap unique). Recommandé vs jauge custom :
// lecture instantanée, labels qui lèvent l'ambiguïté (cf. UX research emoji surveys).
// Data-agnostique : la valeur stockée reste l'un des 4 FEELINGS ; ré-appuyer désélectionne.
function FeelingScale({ value, onChange }: { value: string | null; onChange: (f: string) => void }) {
  return (
    <View style={styles.scaleRow}>
      {FEELINGS.map((f) => {
        const meta = FEELING_STYLE[f];
        const on = value === f;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            hitSlop={4}
            style={[styles.scaleItem, on && { backgroundColor: meta.tint, borderColor: meta.color }]}>
            <ThemedText style={[styles.scaleEmoji, on && styles.scaleEmojiOn]}>{meta.emoji}</ThemedText>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.scaleLabel, { color: on ? meta.ink : Palette.grey }]}>
              {f}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Slider horizontal qui snap par paliers de DUR_STEP entre DUR_MIN et DUR_MAX. */
function DurationSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const geom = useRef({ left: 0, width: 0 });
  const trackRef = useRef<View>(null);

  const snap = (raw: number) => {
    const steps = Math.round((raw - DUR_MIN) / DUR_STEP);
    return Math.min(DUR_MAX, Math.max(DUR_MIN, DUR_MIN + steps * DUR_STEP));
  };

  const setFromPageX = (pageX: number) => {
    const { left, width: w } = geom.current;
    if (w <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - left) / w));
    onChange(snap(DUR_MIN + ratio * (DUR_MAX - DUR_MIN)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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

  const ratio = (value - DUR_MIN) / (DUR_MAX - DUR_MIN);
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: Spacing.four,
    backgroundColor: Palette.border,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: Palette.onyx },
  question: { marginTop: Spacing.four },
  questionSub: { marginTop: Spacing.one, marginBottom: Spacing.three },
  recap: {
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  lbl: { marginTop: Spacing.four, marginBottom: Spacing.two },
  descNote: {
    minHeight: 160,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 18,
    lineHeight: 26,
    textAlignVertical: 'top',
  },
  durRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  durScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  sliderHit: { height: 40, justifyContent: 'center' },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.border,
    overflow: 'hidden',
  },
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
  feelingWrap: { marginTop: Spacing.five },
  scaleRow: { flexDirection: 'row', gap: Spacing.two },
  scaleItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    minHeight: 100,
    borderRadius: Radius.md,
    backgroundColor: Palette.white,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  scaleEmoji: { fontSize: 36, lineHeight: 44 },
  scaleEmojiOn: { transform: [{ scale: 1.12 }] },
  scaleLabel: { textAlign: 'center' },
  tplRow: { gap: Spacing.two, paddingRight: Spacing.four },
  tplCard: {
    width: 168,
    gap: Spacing.one,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  tplHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    paddingVertical: Spacing.one,
  },
  wrap: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
    paddingVertical: 0,
  },
  workEmpty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  chipTextCompact: { fontSize: 12 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    marginBottom: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderStyle: 'dashed',
  },
  search: {
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.border,
  },
  friendBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.xs,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  tagChipTxt: { maxWidth: 150 },
  selectedVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  soloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Palette.onyx, borderColor: Palette.onyx },
  photoAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 88,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderStyle: 'dashed',
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 96, height: 96, borderRadius: Radius.sm, backgroundColor: Palette.white },
  photoRemove: { position: 'absolute', top: 2, right: 2 },
  photoAddTile: {
    width: 96,
    height: 96,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
