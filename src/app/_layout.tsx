import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Palette } from '@/constants/theme';
import { AuthProvider, isSupabaseConfigured, useAuth } from '@/lib/auth/auth-provider';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Tant que Supabase n'est pas configuré (.env), on ne gate pas : l'app reste démo-able.
    if (!isSupabaseConfigured) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.whitePP },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="new-match" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="player" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    'OpenSauceOne-Regular': require('@/assets/fonts/OpenSauceOne-Regular.ttf'),
    'OpenSauceOne-Medium': require('@/assets/fonts/OpenSauceOne-Medium.ttf'),
    'OpenSauceOne-SemiBold': require('@/assets/fonts/OpenSauceOne-SemiBold.ttf'),
    'OpenSauceOne-Bold': require('@/assets/fonts/OpenSauceOne-Bold.ttf'),
    'OpenSauceTwo-Bold': require('@/assets/fonts/OpenSauceTwo-Bold.ttf'),
    'OpenSauceTwo-ExtraBold': require('@/assets/fonts/OpenSauceTwo-ExtraBold.ttf'),
    'OpenSauceTwo-Black': require('@/assets/fonts/OpenSauceTwo-Black.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Palette.whitePP }}>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
