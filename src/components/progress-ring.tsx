import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Palette } from '@/constants/theme';

/**
 * Anneau de progression (SVG). `progress` ∈ [0,1]. Le contenu central (children) est superposé.
 * Utilisé pour l'objectif hebdo d'entraînement (hero « coach »).
 */
export function ProgressRing({
  progress,
  size = 76,
  stroke = 7,
  color = Palette.lime,
  track = 'rgba(255,255,255,0.16)',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const mid = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={mid} cy={mid} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          strokeLinecap="round"
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </Svg>
      {children}
    </View>
  );
}
