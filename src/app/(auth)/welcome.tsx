/**
 * Écran d'accueil (premier lancement) — landing plein écran, façon « hero » :
 * photo de la boutique Ping Pang Paris + dégradé, gros CTA « Créer un compte »,
 * petit lien « J'ai déjà un compte » (rare : seulement réinstall / nouveau tél / après déconnexion ;
 * une session persistée fait arriver l'utilisateur direct sur l'app sans passer par ici).
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image source={require('@/assets/images/welcome.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(16,16,16,0.10)', 'rgba(9,44,37,0.55)', 'rgba(9,44,37,0.96)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.brand}>
            Ping Pang Paris
          </ThemedText>
          <ThemedText type="subtitle" style={styles.tagline}>
            La communauté du ping-pong parisien.
          </ThemedText>

          <Pressable style={styles.cta} onPress={() => router.push('/onboarding')}>
            <ThemedText type="cardTitle" style={styles.ctaLabel}>
              Créer un compte
            </ThemedText>
          </Pressable>

          <Pressable style={styles.signin} onPress={() => router.push('/login')} hitSlop={12}>
            <ThemedText type="cardTitle" style={styles.signinLabel}>
              J&apos;ai déjà un compte
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.evergreen },
  safe: { flex: 1, justifyContent: 'flex-end' },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.three },
  brand: { color: Palette.whitePP, fontSize: 40, lineHeight: 44 },
  tagline: { color: Palette.whitePP, opacity: 0.9, marginBottom: Spacing.four },
  cta: {
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: { color: Palette.evergreen },
  signin: { height: 44, alignItems: 'center', justifyContent: 'center' },
  signinLabel: { color: Palette.whitePP },
});
