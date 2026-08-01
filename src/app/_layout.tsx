import { loadAsync, useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { analytics, loadAnalyticsConsent, useAnalyticsIdentify, useScreenTracking } from '@/lib/analytics';
import { Palette } from '@/constants/theme';
import { AuthProvider, isSupabaseConfigured, useAuth } from '@/lib/auth/auth-provider';
import { queryClient } from '@/lib/query/client';
import { usePushNavigation } from '@/lib/push/use-push-navigation';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, loading, needsOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  usePushNavigation();

  // Analytics : hydrate le consentement RGPD (opt-in) au boot, puis identité + screen views.
  // Tout est no-op tant que le consentement n'est pas donné ET que PostHog n'est pas branché.
  useEffect(() => {
    void loadAnalyticsConsent();
  }, []);
  useAnalyticsIdentify();
  useScreenTracking();
  useEffect(() => {
    analytics.track('app_opened');
  }, []);

  useEffect(() => {
    if (loading) return;
    // Tant que Supabase n'est pas configuré (.env), on ne gate pas : l'app reste démo-able.
    if (!isSupabaseConfigured) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Routes accessibles sans session : onboarding (l'inscription se fait à la fin) + sa recherche FFTT.
    const inOnboarding = segments[0] === 'onboarding';
    const publicRoute = inOnboarding || segments[0] === 'link-fftt';
    if (!session && !inAuthGroup && !publicRoute) {
      router.replace('/welcome');
    } else if (session && inAuthGroup) {
      router.replace('/');
    } else if (session && needsOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [session, loading, needsOnboarding, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.whitePP },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="new-match" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new-slot" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new-training" />
      <Stack.Screen name="train" />
      <Stack.Screen name="mes-seances" />
      <Stack.Screen name="mes-matchs" />
      <Stack.Screen name="challenge" />
      <Stack.Screen name="post-match" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="player" />
      <Stack.Screen name="session" />
      <Stack.Screen name="match" />
      <Stack.Screen name="venue" />
      <Stack.Screen name="link-fftt" />
      <Stack.Screen name="tournoi" />
      <Stack.Screen name="mes-tournois" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    'OpenSauceOne-Regular': require('@/assets/fonts/OpenSauceOne-Regular.ttf'),
    'OpenSauceOne-Medium': require('@/assets/fonts/OpenSauceOne-Medium.ttf'),
    'OpenSauceOne-SemiBold': require('@/assets/fonts/OpenSauceOne-SemiBold.ttf'),
    'OpenSauceOne-Bold': require('@/assets/fonts/OpenSauceOne-Bold.ttf'),
    'OpenSauceTwo-Bold': require('@/assets/fonts/OpenSauceTwo-Bold.ttf'),
    'OpenSauceTwo-ExtraBold': require('@/assets/fonts/OpenSauceTwo-ExtraBold.ttf'),
    'OpenSauceTwo-Black': require('@/assets/fonts/OpenSauceTwo-Black.ttf'),
  });

  // Web : la police Ionicons d'@expo/vector-icons vit sous un chemin `node_modules` que Cloudflare
  // Pages ne sert pas. On charge la famille `ionicons` depuis le chemin propre /ionicons.ttf
  // (copié par pwa-postbuild) → Font.isLoaded('ionicons') devient vrai et les <Icon> s'affichent.
  // Sur natif, rien à faire (la police se charge normalement).
  const [iconsReady, setIconsReady] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    loadAsync({ ionicons: '/ionicons.ttf' }).finally(() => setIconsReady(true));
  }, []);

  // Natif : rafraîchit react-query quand l'app revient au premier plan (les queries périmées
  // se refetchent). Sur web, refetchOnWindowFocus gère déjà le focus de fenêtre.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  // Gate tolérant : une erreur de police ne doit jamais laisser l'app en page blanche.
  const ready = (loaded || !!fontError) && iconsReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Palette.whitePP }}>
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
