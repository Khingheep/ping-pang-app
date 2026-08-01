/**
 * Écran 404 / route inconnue (expo-router affiche ce fichier pour toute route non trouvée).
 * Cf. retour fondateur : gérer proprement les états d'erreur (« très important » pour la V1).
 */
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Icon name="explore" size={34} color={Palette.onyx} />
          </View>
          <ThemedText type="title" style={styles.title}>
            Page introuvable
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.sub}>
            Cette page n&apos;existe pas ou a été déplacée. Reviens à l&apos;accueil et continue à jouer.
          </ThemedText>
          <Pressable style={styles.btn} onPress={() => router.replace('/')}>
            <ThemedText type="cardTitle" themeColor="onBrand">
              Retour à l&apos;accueil
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  sub: { textAlign: 'center', maxWidth: 300 },
  btn: {
    marginTop: Spacing.two,
    height: 52,
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.sm,
    backgroundColor: Palette.onyx,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
