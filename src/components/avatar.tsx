import { memo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';

const COLORS = [Palette.blue, Palette.purple, Palette.lime];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

type AvatarProps = {
  name: string;
  size?: number;
  color?: string;
  uri?: string | null;
};

/** Pastille colorée avec l'initiale, ou la photo de profil si `uri` est fourni. */
export const Avatar = memo(function Avatar({ name, size = 48, color, uri }: AvatarProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Palette.white }}
        contentFit="cover"
      />
    );
  }
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  const bg = color ?? colorFor(name || '?');
  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ fontFamily: 'OpenSauceTwo-Bold', fontSize: size * 0.4, color: Palette.onyx }}>{initial}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
});
