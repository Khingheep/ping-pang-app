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

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  subtitle: { fontFamily: Fonts.heading, fontSize: 22, lineHeight: 28 },
  sectionTitle: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 24 },
  cardTitle: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  default: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
  smallBold: { fontFamily: Fonts.bodySemibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: Fonts.bodySemibold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  metric: { fontFamily: Fonts.display, fontSize: 56, lineHeight: 60, letterSpacing: -1 },
  link: { fontFamily: Fonts.bodySemibold, fontSize: 14, textDecorationLine: 'underline' },
  code: { fontFamily: Fonts.mono, fontSize: 12 },
});
