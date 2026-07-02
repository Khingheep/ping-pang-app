/**
 * Onboarding « une question par écran » (inspiration Hinge), DA blanc/vert.
 * Fond blanc uni (thème clair) : texte onyx, accents verts, cartes blanches.
 *
 * Flux : Prénom+Nom → Type de pongiste → Centres d'intérêt → Email → Photo → Mot de passe
 *        → (auto, si trouvée) Licence FFTT → Autorisations (loc + notifs) → Bienvenue.
 *
 * • Dès le nom saisi : recherche FFTT EN TÂCHE DE FOND (2 sexes) ; résultat proposé à
 *   l'avant-dernière étape, SAUTÉE si rien trouvé (mais affichée en cas d'ERREUR service).
 * • Compte créé à la fin (mailer_autoconfirm = session immédiate).
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import { ffttPointsToElo, levelForElo } from '@/lib/elo';
import {
  searchFftt,
  fetchFfttByLicence,
  ffttSeedPoints,
  resolveFfttPoints,
  type FfttPlayer,
} from '@/lib/fftt/link';
import { useUserLocation } from '@/lib/location/use-location';
import { uploadAvatar } from '@/lib/players/avatar';
import { setHomeVenue, upsertOnboarding } from '@/lib/players/profile';
import { requestNotificationPermission } from '@/lib/push/register';
import { choose, notify } from '@/lib/ui/alert';
import { ClubSearch } from '@/components/club-search';
import { matchVenueByName, type Venue } from '@/lib/venues/venues';

// Cartes / champs sur fond blanc uni.
const SURFACE = Palette.white;

const STEP = { NAME: 0, TYPE: 1, INTERESTS: 2, EMAIL: 3, PHOTO: 4, PASSWORD: 5, FFTT: 6, CLUB: 7, PERMS: 8, DONE: 9 } as const;
const DOTS = 9; // NAME..PERMS

const PLAYER_TYPES = [
  { key: 'occasionnel', emoji: '🌴', title: 'Occasionnel', sub: 'Pour le plaisir, en vacances ou au bureau' },
  { key: 'regulier', emoji: '🔥', title: 'Régulier', sub: 'Souvent, pour passer un bon moment' },
  { key: 'competitif', emoji: '🏆', title: 'Compétitif', sub: 'Chaque point compte' },
  { key: 'licencie', emoji: '🎖️', title: 'Licencié FFTT', sub: 'Tu as un classement officiel' },
];

const INTERESTS = [
  { emoji: '🎯', label: 'Progresser au classement' },
  { emoji: '📍', label: 'Trouver où jouer' },
  { emoji: '🤝', label: 'Rencontrer des joueurs' },
  { emoji: '📊', label: 'Suivre mes stats' },
  { emoji: '🏓', label: 'Jouer en tournoi' },
  { emoji: '😄', label: 'Battre mes potes' },
];

const EMAIL_RE = /.+@.+\..+/;

type PermStatus = 'idle' | 'loading' | 'granted' | 'denied';

/** Ligne d'autorisation (priming) : titre + raison + bouton « Activer » → état accordé. */
function PermRow({
  icon,
  title,
  sub,
  status,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  status: PermStatus;
  onPress: () => void;
}) {
  const granted = status === 'granted';
  return (
    <View style={styles.permRow}>
      <View style={styles.permIcon}>
        <Ionicons name={icon} size={22} color={Palette.evergreen} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="cardTitle">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sub}
        </ThemedText>
      </View>
      <Pressable
        style={[styles.permBtn, granted && styles.permBtnOn]}
        disabled={granted || status === 'loading'}
        onPress={onPress}>
        {status === 'loading' ? (
          <ActivityIndicator color={Palette.evergreen} size="small" />
        ) : granted ? (
          <Ionicons name="checkmark" size={20} color={Palette.evergreen} />
        ) : (
          <ThemedText type="smallBold" themeColor="brand">
            Activer
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

export default function OnboardingScreen() {
  const { session, signUpWithEmail, signOut, markOnboarded } = useAuth();
  const [step, setStep] = useState<number>(STEP.NAME);
  const [busy, setBusy] = useState(false);

  // Permissions (priming) - on ne déclenche la pop-up système que sur tap, jamais au montage.
  const location = useUserLocation(false);
  const [notif, setNotif] = useState<PermStatus>('idle');

  async function askNotif() {
    if (notif === 'loading' || notif === 'granted') return;
    setNotif('loading');
    const ok = await requestNotificationPermission();
    setNotif(ok ? 'granted' : 'denied');
  }

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [playerType, setPlayerType] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [homeVenue, setHomeVenueState] = useState<Venue | null>(null);

  const [ffttResults, setFfttResults] = useState<FfttPlayer[]>([]);
  const [ffttSearching, setFfttSearching] = useState(false);
  const [ffttDone, setFfttDone] = useState(false);
  const [ffttError, setFfttError] = useState(false);
  const [fftt, setFftt] = useState<FfttPlayer | null>(null);
  const searchFired = useRef(false);

  function runFfttSearch() {
    if (searchFired.current) return;
    const nom = lastName.trim();
    const prenom = firstName.trim();
    if (nom.length < 2) return;
    searchFired.current = true;
    setFfttSearching(true);
    setFfttError(false);
    searchFftt({ nom, prenom })
      .then((res) => setFfttResults(res.slice(0, 6)))
      .catch(() => setFfttError(true)) // service FFTT indispo (session expirée…) ≠ « pas trouvé »
      .finally(() => {
        setFfttSearching(false);
        setFfttDone(true);
      });
  }

  /**
   * Sélection d'une licence. La recherche par nom ne renvoie pas les points
   * (HTML PingPocket) → on va chercher le détail pour récupérer la force temps
   * réel et afficher l'ELO de départ tout de suite.
   */
  async function chooseFftt(p: FfttPlayer) {
    if (fftt?.numberId === p.numberId) {
      setFftt(null);
      return;
    }
    setFftt(p);
    // Pré-remplit le club maison depuis la licence si on le retrouve dans nos lieux (sans écraser un choix manuel).
    if (p.club?.nom) {
      matchVenueByName(p.club.nom)
        .then((v) => {
          if (v) setHomeVenueState((cur) => cur ?? v);
        })
        .catch(() => {});
    }
    if (ffttSeedPoints(p) != null) return;
    try {
      const d = await fetchFfttByLicence(p.numberId);
      if (d) {
        setFftt((cur) =>
          cur?.numberId === p.numberId
            ? {
                ...cur,
                pointsTempsReel: d.pointsTempsReel ?? null,
                pointsOfficiels: d.pointsOfficiels,
                pointsMensuels: d.pointsMensuels,
              }
            : cur,
        );
      }
    } catch {
      /* on garde la sélection sans points : le seed se résoudra au submit */
    }
  }

  function retryFfttSearch() {
    searchFired.current = false;
    setFfttDone(false);
    runFfttSearch();
  }

  function toggleInterest(label: string) {
    setInterests((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));
  }

  // Déconnexion depuis l'onboarding (session héritée d'un compte incomplet) → l'écran email
  // repasse en saisie libre, on reste sur l'onboarding pour créer un nouveau compte.
  async function switchAccount() {
    try {
      setBusy(true);
      await signOut();
      setStep(STEP.EMAIL);
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Photo', 'Autorise l’accès aux photos pour ajouter un avatar.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Caméra', 'Autorise l’accès à la caméra pour prendre une photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    setPhoto(res.assets[0].uri);
  }

  function pickPhoto() {
    // Sur le web, le file-picker natif propose déjà « prendre une photo / galerie » selon l'OS.
    if (Platform.OS === 'web') {
      void pickFromLibrary();
      return;
    }
    choose({
      title: 'Photo de profil',
      message: 'Comment veux-tu ajouter ta photo ?',
      options: [
        { text: 'Prendre une photo', onPress: () => void takePhoto() },
        { text: 'Choisir dans la galerie', onPress: () => void pickFromLibrary() },
      ],
    });
  }

  function handleNext() {
    if (busy) return;
    switch (step) {
      case STEP.NAME:
        runFfttSearch();
        return setStep(STEP.TYPE);
      case STEP.TYPE:
        return setStep(STEP.INTERESTS);
      case STEP.INTERESTS:
        return setStep(STEP.EMAIL);
      case STEP.EMAIL:
        return setStep(STEP.PHOTO);
      case STEP.PHOTO:
        return setStep(STEP.PASSWORD);
      case STEP.PASSWORD:
        return setStep(ffttDone && !ffttError && ffttResults.length === 0 ? STEP.CLUB : STEP.FFTT);
      case STEP.FFTT:
        return setStep(STEP.CLUB);
      case STEP.CLUB:
        return setStep(STEP.PERMS);
      case STEP.PERMS:
        return setStep(STEP.DONE);
      default:
        return finish();
    }
  }

  function back() {
    if (step === STEP.NAME) {
      // Onboarding parfois ouvert sans écran derrière (gating needsOnboarding) → éviter GO_BACK non géré.
      if (router.canGoBack()) router.back();
    } else if (step <= STEP.PASSWORD) setStep(step - 1);
  }

  async function finish() {
    try {
      setBusy(true);
      let uid = session?.user?.id ?? null;
      const mail = session?.user?.email ?? email.trim();
      if (!uid) {
        uid = await signUpWithEmail(email.trim(), password);
        if (!uid) {
          notify('Inscription', 'Impossible de créer le compte (email déjà utilisé ?).');
          return;
        }
      }
      let avatar: string | undefined;
      if (photo) {
        try {
          avatar = await uploadAvatar(uid, photo);
        } catch {
          /* la photo est optionnelle */
        }
      }
      const patch: Parameters<typeof upsertOnboarding>[2] = {
        display_name: `${firstName} ${lastName}`.trim() || 'Joueur',
        city: 'Paris',
        country: 'France',
        interests,
        ...(playerType ? { player_type: playerType } : {}),
        ...(avatar ? { avatar_url: avatar } : {}),
      };
      if (fftt) {
        patch.fftt_id = fftt.numberId;
        patch.fftt_club = fftt.club?.nom ?? null;
        // Force temps réel (résout le détail si la ligne de recherche n'a pas de points).
        const pts = await resolveFfttPoints(fftt);
        patch.fftt_points = pts;
        if (pts) {
          const e = ffttPointsToElo(pts);
          patch.elo = e;
          patch.level = levelForElo(e).key;
        }
      }
      await upsertOnboarding(uid, mail, patch);
      // Club maison : écriture isolée (best-effort) pour ne jamais bloquer la création du compte.
      if (homeVenue) await setHomeVenue(uid, homeVenue.id).catch(() => {});
      markOnboarded();
      router.replace('/');
    } catch (e) {
      // Les erreurs Supabase ne sont pas des `Error` → on remonte quand même leur message.
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'message' in e
            ? String((e as { message?: unknown }).message)
            : 'Réessaie.';
      notify('Erreur', msg);
    } finally {
      setBusy(false);
    }
  }

  const hasSession = !!session;
  const canNext =
    step === STEP.NAME
      ? firstName.trim().length >= 2 && lastName.trim().length >= 2
      : step === STEP.TYPE
        ? playerType !== null
        : step === STEP.EMAIL
          ? hasSession || EMAIL_RE.test(email.trim())
          : step === STEP.PASSWORD
            ? hasSession || password.length >= 6
            : true;

  const startPts = fftt ? ffttSeedPoints(fftt) : null;
  const startElo = startPts != null ? ffttPointsToElo(startPts) : null;
  // Sur le 1er écran, la flèche n'a de sens que s'il y a un écran derrière (sinon GO_BACK non géré).
  const showBack = step <= STEP.PASSWORD && (step !== STEP.NAME || router.canGoBack());

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.header}>
          {showBack ? (
            <Pressable onPress={back} hitSlop={12} disabled={busy}>
              <Ionicons name="arrow-back" size={26} color={Palette.onyx} />
            </Pressable>
          ) : (
            <View style={{ width: 26 }} />
          )}
        </View>
        {step < STEP.DONE ? (
          <View style={styles.dots}>
            {Array.from({ length: DOTS }).map((_, i) => (
              <View key={i} style={[styles.dot, i <= step ? styles.dotOn : styles.dotOff]} />
            ))}
          </View>
        ) : null}

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* ── Prénom + Nom ── */}
            {step === STEP.NAME && (
              <>
                <ThemedText type="title">Comment tu t&apos;appelles ?</ThemedText>
                <TextInput style={styles.input} placeholder="Prénom" placeholderTextColor={Palette.grey} value={firstName} onChangeText={setFirstName} autoFocus autoCapitalize="words" />
                <TextInput style={styles.input} placeholder="Nom" placeholderTextColor={Palette.grey} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
              </>
            )}

            {/* ── Type de pongiste ── */}
            {step === STEP.TYPE && (
              <>
                <ThemedText type="title">Quel genre de pongiste es-tu ?</ThemedText>
                <View style={styles.list}>
                  {PLAYER_TYPES.map((t) => {
                    const on = playerType === t.key;
                    return (
                      <Pressable key={t.key} onPress={() => setPlayerType(t.key)} style={[styles.typeCard, on ? styles.cardOn : styles.cardOff]}>
                        <ThemedText type="title" style={styles.typeEmoji}>{t.emoji}</ThemedText>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="cardTitle">{t.title}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">{t.sub}</ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Centres d'intérêt ── */}
            {step === STEP.INTERESTS && (
              <>
                <ThemedText type="title">Qu&apos;est-ce qui t&apos;intéresse ?</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>Choisis-en autant que tu veux.</ThemedText>
                <View style={styles.grid}>
                  {INTERESTS.map((it) => {
                    const on = interests.includes(it.label);
                    return (
                      <Pressable key={it.label} onPress={() => toggleInterest(it.label)} style={[styles.gridCard, on ? styles.cardOn : styles.cardOff]}>
                        <ThemedText type="subtitle">{it.emoji}</ThemedText>
                        <ThemedText type="smallBold" style={styles.gridLabel}>{it.label}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Email ── */}
            {step === STEP.EMAIL && (
              <>
                <ThemedText type="title">Ton email ?</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>Pour sauvegarder ta progression et te reconnecter.</ThemedText>
                {hasSession ? (
                  <>
                    <View style={[styles.input, styles.readonly]}>
                      <ThemedText type="default" themeColor="textSecondary">{session?.user?.email}</ThemedText>
                    </View>
                    <Pressable onPress={switchAccount} disabled={busy} style={styles.linkBtn}>
                      <ThemedText type="smallBold" themeColor="brand">Ce n’est pas toi ? Changer de compte</ThemedText>
                    </Pressable>
                  </>
                ) : (
                  <TextInput style={styles.input} placeholder="email@exemple.com" placeholderTextColor={Palette.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} autoFocus />
                )}
              </>
            )}

            {/* ── Photo de profil (optionnelle) ── */}
            {step === STEP.PHOTO && (
              <>
                <ThemedText type="title">Une photo ?</ThemedText>
                <View style={styles.photoWrap}>
                  <Pressable style={styles.photo} onPress={pickPhoto}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.photoImg} contentFit="cover" />
                    ) : (
                      <Avatar name={firstName || lastName || 'Joueur'} size={128} />
                    )}
                  </Pressable>
                  <Pressable style={styles.photoBadge} onPress={pickPhoto} hitSlop={8}>
                    <Ionicons name="camera" size={18} color={Palette.whitePP} />
                  </Pressable>
                </View>
                {photo ? (
                  <Pressable onPress={() => setPhoto(null)} style={styles.linkBtn}>
                    <ThemedText type="smallBold" themeColor="textSecondary">Retirer la photo</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable onPress={pickPhoto} style={styles.linkBtn}>
                    <ThemedText type="smallBold" themeColor="brand">Ajouter une photo</ThemedText>
                  </Pressable>
                )}
              </>
            )}

            {/* ── Mot de passe ── */}
            {step === STEP.PASSWORD && (
              <>
                <ThemedText type="title">Crée un mot de passe</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                  {hasSession ? 'Ton compte est déjà connecté, tu peux continuer.' : 'Au moins 6 caractères. Il te servira à te reconnecter.'}
                </ThemedText>
                {!hasSession ? (
                  <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor={Palette.grey} secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} autoFocus />
                ) : null}
              </>
            )}

            {/* ── Licence FFTT ── */}
            {step === STEP.FFTT && (
              ffttSearching ? (
                <View style={styles.center}>
                  <ActivityIndicator color={Palette.evergreen} />
                  <ThemedText type="default" themeColor="textSecondary" style={{ marginTop: Spacing.three }}>On cherche ton classement FFTT…</ThemedText>
                </View>
              ) : ffttError ? (
                <View style={styles.center}>
                  <ThemedText type="title" style={{ textAlign: 'center' }}>FFTT indisponible</ThemedText>
                  <ThemedText type="default" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.two }}>
                    Le service FFTT est momentanément indisponible. Réessaie, ou continue et lie ta licence plus tard dans les réglages.
                  </ThemedText>
                  <Pressable onPress={retryFfttSearch} style={styles.retryBtn}>
                    <Ionicons name="refresh" size={18} color={Palette.evergreen} />
                    <ThemedText type="smallBold" themeColor="brand">Réessayer</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ThemedText type="title">C&apos;est toi ? 🏓</ThemedText>
                  <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>Sélectionne ta licence pour récupérer ton classement.</ThemedText>
                  <View style={styles.list}>
                    {ffttResults.map((p) => {
                      const on = fftt?.numberId === p.numberId;
                      // Points/ELO connus seulement après sélection (détail chargé via chooseFftt).
                      const rowPts = on ? ffttSeedPoints(fftt) : null;
                      const elo = rowPts != null ? ffttPointsToElo(rowPts) : null;
                      return (
                        <Pressable key={p.numberId} onPress={() => chooseFftt(p)} style={[styles.ffttRow, on ? styles.cardOn : styles.cardOff]}>
                          <View style={{ flex: 1 }}>
                            <ThemedText type="cardTitle">{p.prenom} {p.nom}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {p.club?.nom ?? 'Club inconnu'}
                              {p.classementOfficiel ? ` · ${p.classementOfficiel}` : ''}
                              {rowPts != null ? ` · ${rowPts} pts` : ''}
                              {elo ? ` · ELO ${elo}` : ''}
                            </ThemedText>
                          </View>
                          <View style={[styles.radio, on && styles.radioOn]} />
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable onPress={() => setFftt(null)} style={styles.linkBtn}>
                    <ThemedText type="smallBold" themeColor="textSecondary">Aucune, ce n&apos;est pas moi</ThemedText>
                  </Pressable>
                </>
              )
            )}

            {/* ── Club / spot habituel ── */}
            {step === STEP.CLUB && (
              <>
                <ThemedText type="title">Ton club ou ton spot ?</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                  Où joues-tu le plus souvent ? On l&apos;épinglera sur ta carte.
                  {fftt ? ' On a pré-rempli depuis ta licence si on l’a trouvé.' : ''}
                </ThemedText>
                <ClubSearch selected={homeVenue} onSelect={setHomeVenueState} />
                <Pressable onPress={() => setHomeVenueState(null)} style={styles.linkBtn}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Je n&apos;ai pas de club, je joue surtout dehors
                  </ThemedText>
                </Pressable>
              </>
            )}

            {/* ── Autorisations (priming loc + notifs) ── */}
            {step === STEP.PERMS && (
              <>
                <ThemedText type="title">Dernière étape !</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
                  Active ces options pour profiter à fond de Ping Pang. Tu pourras toujours les régler plus tard.
                </ThemedText>
                <View style={styles.list}>
                  <PermRow
                    icon="location-outline"
                    title="Localisation"
                    sub="Trouve les parties et les tables près de toi."
                    status={location.status}
                    onPress={() => void location.request()}
                  />
                  <PermRow
                    icon="notifications-outline"
                    title="Notifications"
                    sub="Sois prévenu des défis reçus et des créneaux rejoints."
                    status={notif}
                    onPress={askNotif}
                  />
                </View>
              </>
            )}

            {/* ── Bienvenue ── */}
            {step === STEP.DONE && (
              <View style={styles.center}>
                <View style={styles.logo}>
                  <ThemedText type="title" style={styles.logoEmoji}>🔥</ThemedText>
                </View>
                <ThemedText type="title" style={{ marginTop: Spacing.four, textAlign: 'center' }}>Bienvenue{firstName ? `, ${firstName}` : ''} !</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.two }}>
                  {startElo ? `Ton classement de départ : ELO ${startElo}. ` : ''}Va t&apos;échauffer, c&apos;est à toi !
                </ThemedText>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          <Pressable style={[styles.nextBtn, (!canNext || busy) && { opacity: 0.5 }]} disabled={busy || !canNext} onPress={handleNext}>
            {busy ? (
              <ActivityIndicator color={Palette.whitePP} />
            ) : (
              <ThemedText type="cardTitle" themeColor="onBrand">
                {step === STEP.DONE ? "Entrer dans l'app 🏓" : 'Continuer'}
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
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, height: 38, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: Spacing.one, paddingTop: Spacing.two, paddingHorizontal: Spacing.four },
  dot: { height: 4, borderRadius: 2, flex: 1 },
  dotOn: { backgroundColor: Palette.evergreen },
  dotOff: { backgroundColor: Palette.border },
  scroll: { paddingHorizontal: Spacing.four, paddingTop: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.two, flexGrow: 1 },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.two },
  input: {
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 16,
    marginTop: Spacing.two,
  },
  readonly: { justifyContent: 'center' },
  linkBtn: { alignItems: 'center', paddingVertical: Spacing.three, marginTop: Spacing.one },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    height: 48,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Palette.evergreen,
  },
  photoWrap: { alignSelf: 'center', width: 128, height: 128, marginTop: Spacing.five },
  photo: { width: 128, height: 128, borderRadius: 64, backgroundColor: Palette.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImg: { width: 128, height: 128, borderRadius: 64 },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Palette.whitePP,
  },
  list: { gap: Spacing.two, marginTop: Spacing.three },
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.four, borderRadius: Radius.sm, borderWidth: 1 },
  typeEmoji: { fontSize: 28 },
  cardOn: { backgroundColor: Palette.lime, borderColor: Palette.evergreen },
  cardOff: { backgroundColor: SURFACE, borderColor: Palette.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  gridCard: { width: '48%', aspectRatio: 1.4, borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.three },
  gridLabel: { textAlign: 'center' },
  ffttRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.four, borderRadius: Radius.sm, borderWidth: 1 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.sm,
    borderWidth: 1,
    backgroundColor: SURFACE,
    borderColor: Palette.border,
  },
  permIcon: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  permBtn: {
    minWidth: 84,
    height: 40,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: Palette.evergreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  permBtnOn: { backgroundColor: Palette.lime },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Palette.grey },
  radioOn: { borderColor: Palette.evergreen, backgroundColor: Palette.evergreen },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six },
  logo: { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 52, lineHeight: 64, textAlign: 'center' },
  footer: { padding: Spacing.four },
  nextBtn: { height: 54, borderRadius: Radius.sm, backgroundColor: Palette.evergreen, alignItems: 'center', justifyContent: 'center' },
});
