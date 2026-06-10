import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Palette, Radius, Spacing } from '@/constants/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: ReactNode;
};

/** Gabarit d'écran standard (fond evergreen, header logo + titre, contenu scrollable). */
export function Screen({ title, subtitle, eyebrow = 'PING PANG · PARIS', children }: ScreenProps) {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="label" themeColor="brand">
            {eyebrow}
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
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

/** Carte surface élevée (Eugenia : bg blanc 6%, border 12%, radius 16). */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.evergreen },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
  title: { marginTop: Spacing.two },
  subtitle: { marginTop: Spacing.one },
  body: { marginTop: Spacing.four, gap: Spacing.three },
  card: {
    backgroundColor: 'rgba(245,246,243,0.06)',
    borderColor: 'rgba(245,246,243,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
