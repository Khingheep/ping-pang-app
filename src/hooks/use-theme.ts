/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // App dark-first ? Non : light-first. Les 2 schémas mappent le même thème,
  // donc tout sauf 'dark' (incl. null/undefined) → light.
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
