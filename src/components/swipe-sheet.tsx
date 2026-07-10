/**
 * Bottom-sheet réutilisable, fermable par glissement vers le bas (swipe-down) depuis la
 * poignée, en plus du tap sur le fond grisé. Le geste vit uniquement sur la poignée pour
 * ne pas entrer en conflit avec le scroll/saisie du contenu (listes, inputs, chips…).
 *
 * Driver JS sur le web (la PWA n'a pas de driver natif), natif sinon. La feuille s'anime
 * en ouverture et en fermeture ; passer `visible` à false depuis le parent rejoue la sortie.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette, Radius, Spacing } from '@/constants/theme';

const USE_NATIVE = Platform.OS !== 'web';
const DISMISS_DISTANCE = 100; // px de glissement vers le bas pour fermer
const DISMISS_VELOCITY = 0.5; // ou flick rapide

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SwipeSheet({
  visible,
  onClose,
  children,
  style,
  background = Palette.whitePP,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Style du conteneur de la feuille (height/maxHeight, padding horizontal, gap…). */
  style?: StyleProp<ViewStyle>;
  background?: string;
}) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const [mounted, setMounted] = useState(visible);
  // Web (PWA) : KeyboardAvoidingView est un no-op → on suit le clavier via l'API visualViewport
  // (le clavier iOS Safari rétrécit la fenêtre visuelle) pour remonter la feuille au-dessus.
  const [kbInset, setKbInset] = useState(0);
  const translateY = useRef(new Animated.Value(screenH)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = (window as unknown as { visualViewport?: VisualViewport }).visualViewport;
    if (!vv) return;
    const onResize = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(screenH);
      Animated.spring(translateY, { toValue: 0, friction: 11, tension: 90, useNativeDriver: USE_NATIVE }).start();
    } else if (mounted) {
      Animated.timing(translateY, { toValue: screenH, duration: 200, useNativeDriver: USE_NATIVE }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 2,
      onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
        } else {
          Animated.spring(translateY, { toValue: 0, friction: 11, tension: 90, useNativeDriver: USE_NATIVE }).start();
        }
      },
    }),
  ).current;

  const backdropOpacity = translateY.interpolate({ inputRange: [0, screenH], outputRange: [1, 0], extrapolate: 'clamp' });

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => onCloseRef.current()}>
      {/* KeyboardAvoidingView : la feuille remonte au-dessus du clavier (sinon il masque les
          champs de saisie + le bouton de validation, ex. score d'un match). */}
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AnimatedPressable style={[styles.scrim, { opacity: backdropOpacity }]} onPress={() => onCloseRef.current()} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: background, paddingBottom: insets.bottom + Spacing.four },
            style,
            // marginBottom = hauteur du clavier (web) → la feuille reste au-dessus. 0 sur natif (KAV gère).
            { marginBottom: kbInset, transform: [{ translateY }] },
          ]}>
          <View style={styles.grab} {...pan.panHandlers}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '94%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  grab: { alignSelf: 'stretch', alignItems: 'center', paddingTop: Spacing.one, paddingBottom: Spacing.two },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.border },
});
