import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'title' // h1 hero (Open Sauce Two Black)
  | 'subtitle' // gros titre (ExtraBold)
  | 'sectionTitle' // h2 section
  | 'cardTitle' // titre de carte
  | 'small'
  | 'smallBold'
  | 'label' // meta uppercase tracking large
  | 'metric' // chiffre data hero 0-100
  | 'link'
  | 'code';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'link' ? 'brand' : 'text')];

  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

// Échelle typo du brand-guideline « Neo » — famille Open Sauce One, ~120% de line-height :
// Display 32 · H1 28 · H2 24 · H3 20 · Body 16 · Subtitle 14 · Caption 12.
const styles = StyleSheet.create({
  metric: { fontFamily: Fonts.bodyBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 }, // Display 32
  title: { fontFamily: Fonts.bodyBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 }, // H1 28
  subtitle: { fontFamily: Fonts.bodyBold, fontSize: 24, lineHeight: 30 }, // H2 24
  sectionTitle: { fontFamily: Fonts.bodySemibold, fontSize: 20, lineHeight: 24 }, // H3 20
  cardTitle: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 20 }, // Body 16 (bold)
  default: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 20 }, // Body 16
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 18 }, // Subtitle 14
  smallBold: { fontFamily: Fonts.bodySemibold, fontSize: 14, lineHeight: 18 }, // Subtitle 14 (semibold)
  label: { fontFamily: Fonts.bodySemibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }, // Caption 12
  link: { fontFamily: Fonts.bodySemibold, fontSize: 14, textDecorationLine: 'underline' }, // Subtitle 14
  code: { fontFamily: Fonts.mono, fontSize: 12 }, // Caption 12
});
