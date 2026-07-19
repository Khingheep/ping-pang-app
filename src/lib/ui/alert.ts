import { Alert, Platform } from 'react-native';

/**
 * Alertes multiplateformes.
 *
 * Sur react-native-web, `Alert.alert` ne rend qu'un `window.alert` du titre+message
 * et n'invoque JAMAIS les callbacks `onPress` des boutons. Toute logique branchée sur
 * un bouton (navigation, confirmation) est donc silencieusement perdue sur le web.
 * Ces helpers rétablissent un comportement correct sur web ET natif.
 */

/** Notice d'information / d'erreur. Pas de callback : juste un message. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert([title, message].filter(Boolean).join('\n\n'));
    }
    return;
  }
  Alert.alert(title, message);
}

/**
 * Confirmation oui/non. Résout `true` si l'utilisateur confirme, `false` sinon.
 * À `await`er dans une fonction async :
 *   if (!(await confirm({ title: 'Supprimer ?', destructive: true }))) return;
 */
export function confirm(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = 'OK', cancelText = 'Annuler', destructive } = opts;

  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined'
        ? window.confirm([title, message].filter(Boolean).join('\n\n'))
        : false;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Choix parmi plusieurs actions (style action sheet). Natif : `Alert.alert` multi-boutons.
 * Web : pas d'action sheet natif → `window.confirm` (binaire) ne gère qu'UNE option (OK = 1re) ;
 * ANNULER ne déclenche JAMAIS d'action. Pour présenter 2+ options sur le web, utilise plutôt
 * une vraie feuille en composant (ex. SwipeSheet) — cf. le signalement dans player.tsx.
 */
export function choose(opts: {
  title: string;
  message?: string;
  options: { text: string; onPress?: () => void; destructive?: boolean }[];
  cancelText?: string;
}): void {
  const { title, message, options, cancelText = 'Annuler' } = opts;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    const ok = window.confirm([title, message].filter(Boolean).join('\n\n'));
    if (ok) options[0]?.onPress?.(); // Annuler = ne rien faire (ne surtout pas déclencher option[1])
    return;
  }

  Alert.alert(title, message, [
    ...options.map((o) => ({
      text: o.text,
      style: (o.destructive ? 'destructive' : 'default') as 'destructive' | 'default',
      onPress: o.onPress,
    })),
    { text: cancelText, style: 'cancel' as const },
  ]);
}
