/**
 * Tokens de design centralisés — SOURCE DE VÉRITÉ unique du style de l'app.
 *
 * ⚠️ Design NON figé. Ces tokens implémentent la fondation de marque Eugenia
 * (cf. ../../../vision.md §10 et design.md). Dès que le designer livre le Figma,
 * on met à jour CE fichier (et lui seul) pour re-skinner toute l'app.
 *
 * Règle d'or Eugenia : les couleurs secondaires (mauve/lime/blue) sont réservées
 * à la SIGNALISATION DATA (succès, erreurs, deltas, comparaisons). Jamais déco.
 */

import { Platform } from 'react-native';

/** Palette brute Eugenia v2 — ne pas consommer directement dans les écrans, passer par `Colors`. */
export const Palette = {
  evergreen: '#092C25',
  whitePP: '#F5F6F3',
  onyx: '#101010',
  mauve: '#E64949',
  lime: '#E6FFA5',
  bluePP: '#A5C6FF',
  gris: '#F0F0F0',
  grisFonce: '#A0A0A0',
} as const;

/**
 * Couleurs sémantiques par schéma. L'app est DARK-FIRST (userInterfaceStyle: dark).
 * Le light mode = V1.1 post-lancement ; il est défini ici pour que les primitives
 * ne cassent pas, mais n'est pas encore câblé.
 */
const dark = {
  text: Palette.whitePP,
  textSecondary: 'rgba(245,246,243,0.6)',
  textMuted: 'rgba(245,246,243,0.4)',
  background: Palette.evergreen,
  backgroundElement: 'rgba(245,246,243,0.06)',
  backgroundSelected: 'rgba(245,246,243,0.12)',
  border: 'rgba(245,246,243,0.12)',
  brand: Palette.lime,
  onBrand: Palette.evergreen,
  danger: Palette.mauve,
  success: Palette.lime,
  info: Palette.bluePP,
} as const;

const light = {
  text: Palette.onyx,
  textSecondary: 'rgba(16,16,16,0.6)',
  textMuted: 'rgba(16,16,16,0.4)',
  background: Palette.whitePP,
  backgroundElement: '#FFFFFF',
  backgroundSelected: Palette.gris,
  border: 'rgba(16,16,16,0.10)',
  brand: Palette.evergreen,
  onBrand: Palette.whitePP,
  danger: Palette.mauve,
  success: '#2E7D32',
  info: Palette.bluePP,
} as const;

export const Colors = { light, dark } as const;
export type ThemeColor = keyof typeof dark & keyof typeof light;

/**
 * Familles de police Open Sauce (chargées dans app/_layout.tsx via useFonts).
 * Avec des polices custom, on cible la famille EXACTE par graisse (le fontWeight
 * ne suffit pas à sélectionner le bon fichier).
 */
export const Fonts = {
  /** Open Sauce Two — titres marketing, logo, chiffres hero */
  display: 'OpenSauceTwo-Black',
  displayBold: 'OpenSauceTwo-Bold',
  heading: 'OpenSauceTwo-ExtraBold',
  /** Open Sauce One — body, labels, navigation, CTA */
  body: 'OpenSauceOne-Regular',
  bodyMedium: 'OpenSauceOne-Medium',
  bodySemibold: 'OpenSauceOne-SemiBold',
  bodyBold: 'OpenSauceOne-Bold',
  mono: Platform.select({ ios: 'ui-monospace', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Rayons de coins (Eugenia : CTA/inputs = pill, cards = 16). */
export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
