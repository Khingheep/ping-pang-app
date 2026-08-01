import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase/client';

// Afficher les notifications même app au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Demande SEULEMENT la permission notifications (priming onboarding), sans enregistrer de token.
 * L'enregistrement du token Expo se fait plus tard via `registerForPush` (après création du compte).
 * Retourne true si accordée. Marche sur iOS/Android et web (API Notification du navigateur).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Enregistre le device pour les push et sauvegarde le token Expo.
 * Ne demande PAS la permission (le priming se fait dans l'onboarding via `requestNotificationPermission`) :
 * on enregistre seulement si elle est déjà accordée. No-op silencieux sinon, sur Expo Go / simulateur.
 * Retourne le token, ou null si indisponible.
 */
export async function registerForPush(playerId: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Panger',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return null;

    await supabase.from('push_tokens').upsert(
      { player_id: playerId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    return token;
  } catch (e) {
    // Attendu sur Expo Go : "remote notifications are not supported in Expo Go"
    console.log('[push] enregistrement ignoré:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
