import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';

/**
 * Barre d'onglets « Neo » (export Figma récent) : rangée PLATE de 5 icônes Material
 * Symbols, sans libellé. Icône active = tracé rempli + onyx (#171717), inactive =
 * contour + gris (#A3A3A3). Ordre : Défis · Ranking · Accueil · Map · Train.
 *
 * Barre custom (et non celle d'expo-router) pour maîtriser l'espacement, l'absence
 * de label et le rendu rempli/contour des icônes SVG.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        const color = isFocused ? Palette.onyx : Palette.grey;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={(options.title ?? route.name) as string}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.slot}
            hitSlop={8}>
            {options.tabBarIcon?.({ focused: isFocused, color, size: 30 })}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.whitePP,
    borderTopColor: Palette.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 32,
    paddingTop: 12,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
