import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/theme';

/**
 * Slider horizontal générique qui snap par paliers de `step` entre `min` et `max`.
 * Même mécanique/look (neutre onyx) que les sliders durée (new-training) et nombre de
 * joueurs (tournoi-new), factorisé ici. Le libellé de la valeur s'affiche côté écran.
 */
export function StepSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const geom = useRef({ left: 0, width: 0 });
  const trackRef = useRef<View>(null);

  const snap = (raw: number) => {
    const steps = Math.round((raw - min) / step);
    return Math.min(max, Math.max(min, min + steps * step));
  };

  const setFromPageX = (pageX: number) => {
    const { left, width: w } = geom.current;
    if (w <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - left) / w));
    onChange(snap(min + ratio * (max - min)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Empêche le ScrollView parent de « voler » le geste en plein drag.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const pageX = e.nativeEvent.pageX;
        trackRef.current?.measureInWindow((x, _y, w) => {
          geom.current = { left: x, width: w };
          setFromPageX(pageX);
        });
      },
      onPanResponderMove: (_e, g) => setFromPageX(g.moveX),
    }),
  ).current;

  const ratio = (value - min) / (max - min);
  const THUMB = 26;
  const x = ratio * width;

  return (
    <View
      ref={trackRef}
      style={styles.hit}
      onLayout={() => {
        trackRef.current?.measureInWindow((lx, _ly, w) => {
          geom.current = { left: lx, width: w };
          setWidth(w);
        });
      }}
      {...responder.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: x }]} />
      </View>
      <View style={[styles.thumb, { left: x - THUMB / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Palette.onyx },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.whitePP,
    borderWidth: 3,
    borderColor: Palette.onyx,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
