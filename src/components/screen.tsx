import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

/** Gabarit d'écran standard (fond clair, grand titre, contenu scrollable). */
export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="title">{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Carte surface (blanc, bordure fine). */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
  subtitle: { marginTop: Spacing.one },
  body: { marginTop: Spacing.four, gap: Spacing.three },
  card: {
    backgroundColor: Palette.white,
    borderColor: Palette.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
