import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { notifRoute, type NotifData } from '@/lib/social/notifications';

type PushData = NotifData & { type?: string };

/**
 * Branche le deep-link au tap d'une notification push système.
 * - Cold start : si l'app est lancée DEPUIS une notif, on route après le montage.
 * - Runtime : on écoute les taps pendant que l'app tourne (foreground/background).
 * Le payload `data` est posé par l'edge function `push-send` ({ type, match_id, … }).
 */
export function usePushNavigation() {
  const router = useRouter();

  useEffect(() => {
    // Les notifications push système n'existent pas sur web/PWA (`getLastNotificationResponseAsync`
    // & les listeners lèvent « not available on web ») → hook no-op côté navigateur.
    if (Platform.OS === 'web') return;

    function go(data: PushData | undefined) {
      if (!data?.type) return;
      const { type, ...entity } = data;
      const target = notifRoute(type, entity as NotifData);
      if (target) router.push(target as Parameters<typeof router.push>[0]);
    }

    let cancelled = false;
    // Cold start : l'app a été ouverte en tapant une notif.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      go(response.notification.request.content.data as PushData | undefined);
    });

    // Runtime : taps pendant que l'app est ouverte.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data as PushData | undefined);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);
}
