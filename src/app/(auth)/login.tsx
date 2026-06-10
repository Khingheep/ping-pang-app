import { Ionicons } from '@expo/vector-icons';
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
import { type AuthProviderId, useAuth } from '@/lib/auth/auth-provider';

// Aligné sur le Figma « ON-01 · Welcome » (Ping Pang Connect), mode clair.
export default function LoginScreen() {
  const { signIn, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingOAuth, setPendingOAuth] = useState<AuthProviderId | null>(null);

  async function submitEmail() {
    if (!email || !password) {
      Alert.alert('Champs requis', 'Renseigne ton email et ton mot de passe.');
      return;
    }
    try {
      setBusy(true);
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password);
        Alert.alert('Compte créé', 'Tu peux maintenant te connecter.');
        setMode('signin');
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: AuthProviderId) {
    try {
      setPendingOAuth(provider);
      await signIn(provider);
    } catch (e) {
      Alert.alert('Connexion impossible', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setPendingOAuth(null);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.circle}>
              <View style={styles.dash} />
            </View>
            <ThemedText type="title" style={styles.h1}>
              Ping Pang{'\n'}Connect
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
              Rassemble les pongistes{'\n'}autour d&apos;une même table.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Palette.grey}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor={Palette.grey}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={submitEmail}>
              {busy ? (
                <ActivityIndicator color={Palette.whitePP} />
              ) : (
                <ThemedText type="cardTitle" themeColor="onBrand">
                  {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
                </ThemedText>
              )}
            </Pressable>

            <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <ThemedText type="link" themeColor="text" style={styles.toggle}>
                {mode === 'signin' ? 'Pas de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
              </ThemedText>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.line} />
              <ThemedText type="small" themeColor="textSecondary">
                ou
              </ThemedText>
              <View style={styles.line} />
            </View>

            <Pressable
              style={[styles.btn, styles.btnOutline]}
              disabled={pendingOAuth !== null}
              onPress={() => oauth('google')}>
              {pendingOAuth === 'google' ? (
                <ActivityIndicator color={Palette.onyx} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={Palette.onyx} />
                  <ThemedText type="cardTitle">Continuer avec Google</ThemedText>
                </>
              )}
            </Pressable>

            {Platform.OS === 'ios' && (
              <Pressable
                style={[styles.btn, styles.btnOutline]}
                disabled={pendingOAuth !== null}
                onPress={() => oauth('apple')}>
                {pendingOAuth === 'apple' ? (
                  <ActivityIndicator color={Palette.onyx} />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color={Palette.onyx} />
                    <ThemedText type="cardTitle">Continuer avec Apple</ThemedText>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four, justifyContent: 'center', paddingVertical: Spacing.six },
  hero: { alignItems: 'center', marginBottom: Spacing.six },
  circle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.five,
  },
  dash: { width: 36, height: 6, borderRadius: 3, backgroundColor: Palette.onyx },
  h1: { textAlign: 'center', fontSize: 40, lineHeight: 44 },
  tagline: { textAlign: 'center', marginTop: Spacing.three },
  form: { gap: Spacing.three },
  input: {
    height: 54,
    borderRadius: Radius.sm,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.three,
    color: Palette.onyx,
    fontFamily: 'OpenSauceOne-Regular',
    fontSize: 15,
  },
  btn: {
    height: 54,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  btnPrimary: { backgroundColor: Palette.evergreen },
  btnOutline: { borderWidth: 1, borderColor: Palette.border, backgroundColor: Palette.white },
  toggle: { textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginVertical: Spacing.one },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Palette.border },
});
