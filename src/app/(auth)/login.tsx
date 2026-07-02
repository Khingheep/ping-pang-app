/**
 * Connexion (« J'ai déjà un compte ») - email + mot de passe.
 * Atteint seulement après réinstallation / nouveau téléphone / déconnexion (sinon la
 * session persistée fait arriver direct dans l'app).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { notify } from '@/lib/ui/alert';

export default function LoginScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitEmail() {
    if (!email || !password) {
      notify('Champs requis', 'Renseigne ton email et ton mot de passe.');
      return;
    }
    try {
      setBusy(true);
      await signInWithEmail(email.trim(), password);
      // La navigation est gérée par le RootNavigator dès que la session s'ouvre.
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  }

  return (
    <SafeAreaView style={styles.root}>
      <Pressable style={styles.back} onPress={back} hitSlop={12}>
        <Ionicons name="arrow-back" size={26} color={Palette.onyx} />
      </Pressable>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.circle}>
              <View style={styles.dash} />
            </View>
            <ThemedText type="title" style={styles.h1}>
              Ping Pang{'\n'}Paris
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
              Connecte-toi pour retrouver ta progression.
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
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />

            <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={submitEmail}>
              {busy ? <ActivityIndicator color={Palette.whitePP} /> : <ThemedText type="cardTitle" themeColor="onBrand">Se connecter</ThemedText>}
            </Pressable>

            <Pressable onPress={() => router.push('/onboarding')}>
              <ThemedText type="link" themeColor="text" style={styles.toggle}>Pas de compte ? Créer un compte</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  back: { position: 'absolute', top: Spacing.three, left: Spacing.four, zIndex: 10, paddingTop: Spacing.three },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.four, justifyContent: 'center', paddingVertical: Spacing.six },
  hero: { alignItems: 'center', marginBottom: Spacing.six },
  circle: { width: 120, height: 120, borderRadius: 60, backgroundColor: Palette.lime, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.five },
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
    fontSize: 16,
  },
  btn: { height: 54, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  btnPrimary: { backgroundColor: Palette.evergreen },
  toggle: { textAlign: 'center' },
});
