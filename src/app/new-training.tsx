import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
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
  FEELINGS,
  fetchSessionTemplates,
  formatDuration,
  MAX_SESSION_PHOTOS,
  PARTNER_LEVELS,
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

// Emoji par feeling (la valeur stockée reste le mot FR — cf. FEELINGS / FEELING_COLOR).
const FEELING_EMOJI: Record<string, string> = {
  Difficile: '😣',
  Moyen: '😐',
  Bien: '🙂',
  Excellent: '🤩',
};

export default function NewTrainingScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ template?: string }>();
  const [strokes, setStrokes] = useState<string[]>([]);
  const [showAllStrokes, setShowAllStrokes] = useState(false);
  const [duration, setDuration] = useState(60);
  const [partner, setPartner] = useState<string | null>(null);
  const [partnerElo, setPartnerElo] = useState('');
  const [candidates, setCandidates] = useState<PartnerCandidate[]>([]);
  const [partnerPlayer, setPartnerPlayer] = useState<PartnerCandidate | null>(null);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [feeling, setFeeling] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [customVenue, setCustomVenue] = useState<string | null>(null); // lieu tapé à la main, hors base
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [isSolo, setIsSolo] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const appliedTemplate = useRef(false);

  useEffect(() => {
    fetchVenues().then(setVenues);
  }, []);

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
  // accordée (ne déclenche jamais le popup iOS — ça reste réservé au bouton).
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
        `${near.venue.name} — à ${near.distanceKm.toFixed(1)} km. Change-le si ce n’est pas le bon.`,
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
    // Sans recherche, on propose juste les premiers (amis en tête grâce au tri).
    const base = q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
    return base.slice(0, 3);
  }, [partnerQuery, candidates]);

  function selectPartnerPlayer(c: PartnerCandidate) {
    setPartnerPlayer(c);
    setPartner(null); // un vrai joueur prime sur le niveau générique
    setPartnerQuery('');
  }

  /** Pré-remplit le formulaire à partir d'une séance passée (note & photo restent vides). */
  function applyTemplate(t: SessionTemplate) {
    setStrokes(t.strokes);
    setShowAllStrokes(t.strokes.some((s) => STROKES.indexOf(s) >= STROKES_PREVIEW_COUNT));
    setDuration(t.durationMin);
    setFeeling(t.feeling);
    setIsSolo(t.isSolo);

    // Partenaire : vrai joueur > ELO précis > niveau générique.
    if (t.isSolo || (!t.partner && !t.partnerLevel)) {
      setPartnerPlayer(null);
      setPartner(null);
      setPartnerElo('');
    } else if (t.partner) {
      setPartnerPlayer({
        id: t.partner.id,
        name: t.partner.name,
        avatarUrl: t.partner.avatarUrl,
        isFriend: candidates.find((c) => c.id === t.partner!.id)?.isFriend ?? false,
      });
      setPartner(null);
      setPartnerElo('');
    } else if (t.partnerLevel?.startsWith('ELO ')) {
      setPartnerElo(t.partnerLevel.slice(4).trim());
      setPartner(null);
      setPartnerPlayer(null);
    } else {
      setPartner(t.partnerLevel);
      setPartnerElo('');
      setPartnerPlayer(null);
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
        partnerLevel: isSolo ? null : partnerElo.trim() ? `ELO ${partnerElo.trim()}` : partner,
        partnerId: isSolo ? null : partnerPlayer?.id ?? null,
        venueId: venue?.id ?? null,
        venueLabel: venue ? null : customVenue,
        feeling,
        note: note.trim() || null,
        photoUrls,
        isSolo,
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

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Noter un entraînement</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {templates.length > 0 ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.lbl, { marginTop: 0 }]}>
                RÉPÉTER UNE SÉANCE
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tplRow}>
                {templates.map((t) => {
                  const partnerLabel = t.isSolo ? 'Solo' : t.partner?.name ?? t.partnerLevel ?? null;
                  return (
                    <Pressable key={t.id} style={styles.tplCard} onPress={() => applyTemplate(t)}>
                      <View style={styles.tplHead}>
                        <ThemedText type="cardTitle" themeColor="brand">
                          {formatDuration(t.durationMin)}
                        </ThemedText>
                        <Ionicons name="repeat" size={16} color={Palette.evergreen} />
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

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            COUPS TRAVAILLÉS
          </ThemedText>
          <View style={styles.wrap}>
            {(showAllStrokes
              ? STROKES
              : STROKES.filter((s, i) => i < STROKES_PREVIEW_COUNT || strokes.includes(s))
            ).map((s) => (
              <Chip key={s} label={s} active={strokes.includes(s)} onPress={() => toggleStroke(s)} color={Palette.purple} />
            ))}
          </View>
          {STROKES.length > STROKES_PREVIEW_COUNT ? (
            <Pressable style={styles.seeAll} onPress={() => setShowAllStrokes((v) => !v)} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="brand">
                {showAllStrokes ? 'Voir moins' : 'Voir tout'}
              </ThemedText>
              <Ionicons
                name={showAllStrokes ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Palette.evergreen}
              />
            </Pressable>
          ) : null}

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

          <Pressable style={styles.soloRow} onPress={() => setIsSolo((v) => !v)}>
            <ThemedText type="cardTitle">Session seul</ThemedText>
            <View style={[styles.checkbox, isSolo && styles.checkboxOn]}>
              {isSolo ? <Ionicons name="checkmark" size={16} color={Palette.whitePP} /> : null}
            </View>
          </Pressable>

          {!isSolo ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
                PARTENAIRE
              </ThemedText>
              {partnerPlayer ? (
                <View style={styles.selectedVenue}>
                  <Avatar name={partnerPlayer.name} uri={partnerPlayer.avatarUrl} size={28} />
                  <ThemedText type="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {partnerPlayer.name}
                  </ThemedText>
                  <Pressable onPress={() => setPartnerPlayer(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={Palette.grey} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.search}
                    placeholder="Rechercher un joueur Ping Pang Paris"
                    placeholderTextColor={Palette.grey}
                    value={partnerQuery}
                    onChangeText={setPartnerQuery}
                  />
                  {partnerMatches.map((c) => (
                    <Pressable key={c.id} style={styles.match} onPress={() => selectPartnerPlayer(c)}>
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
                </>
              )}

              {!partnerPlayer ? (
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

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            LIEU
          </ThemedText>
          {venue || customVenue ? (
            <View style={styles.selectedVenue}>
              <Ionicons name={customVenue ? 'flag' : 'location'} size={16} color={Palette.evergreen} />
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
                  <ActivityIndicator size="small" color={Palette.evergreen} />
                ) : (
                  <Ionicons name="locate" size={18} color={Palette.evergreen} />
                )}
                <ThemedText type="smallBold" themeColor="brand">
                  {locating ? 'Localisation…' : 'Utiliser ma position'}
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
                  <Ionicons name="add-circle-outline" size={16} color={Palette.evergreen} />
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

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            FEELING SUR LA SÉANCE
          </ThemedText>
          <View style={styles.row}>
            {FEELINGS.map((f) => {
              const active = feeling === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFeeling(active ? null : f)}
                  style={[styles.feelChip, active ? styles.feelChipOn : styles.chipIdle]}>
                  <ThemedText type="default" style={styles.feelEmoji}>
                    {FEELING_EMOJI[f] ?? '🏓'}
                  </ThemedText>
                  <ThemedText type="small" themeColor={active ? 'onBrand' : 'textSecondary'} numberOfLines={1} style={styles.feelLbl}>
                    {f}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            TES SENSATIONS
          </ThemedText>
          <TextInput
            style={styles.note}
            placeholder="Ex : bon contrôle, le revers progresse..."
            placeholderTextColor={Palette.grey}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.lbl}>
            PHOTOS (OPTIONNEL · {MAX_SESSION_PHOTOS} MAX)
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
                  <Ionicons name="add" size={28} color={Palette.evergreen} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable style={styles.photoAdd} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={22} color={Palette.evergreen} />
              <ThemedText type="smallBold" themeColor="brand">
                Ajouter des photos
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
          {busy ? (
            <ActivityIndicator color={Palette.whitePP} />
          ) : (
            <ThemedText type="cardTitle" themeColor="onBrand">
              Enregistrer la séance
            </ThemedText>
          )}
        </Pressable>
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
  color = Palette.evergreen,
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
        themeColor={active && color === Palette.evergreen ? 'onBrand' : 'text'}
        numberOfLines={1}
        style={compact && styles.chipTextCompact}>
        {label}
      </ThemedText>
    </Pressable>
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
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  lbl: { marginTop: Spacing.four, marginBottom: Spacing.two },
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
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: Palette.evergreen },
  sliderThumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.whitePP,
    borderWidth: 3,
    borderColor: Palette.evergreen,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
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
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIdle: { backgroundColor: Palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.border },
  chipTextCompact: { fontSize: 12 },
  feelChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    borderRadius: Radius.xs,
  },
  feelChipOn: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  feelEmoji: { fontSize: 26, lineHeight: 32 },
  feelLbl: { fontSize: 11 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    marginBottom: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.evergreen,
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
    marginTop: Spacing.four,
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
  checkboxOn: { backgroundColor: Palette.evergreen, borderColor: Palette.evergreen },
  note: {
    minHeight: 88,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
  },
  photoAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 88,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.evergreen,
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
    borderColor: Palette.evergreen,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    margin: Spacing.four,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
