/**
 * Tokens de design centralisés - SOURCE DE VÉRITÉ unique du style de l'app.
 *
 * Aligné sur le Figma « Ping Pang Connect » (designer = source de vérité).
 * ⚠️ Le design réel est en MODE CLAIR (fond off-white, texte onyx), l'evergreen
 * est un accent (headers, boutons primaires, nav active). Ça remplace le « dark
 * mode dominant » du design.md historique.
 *
 * Re-skin = on touche CE fichier uniquement. Aucun hex en dur dans les écrans.
 */

import { Platform } from 'react-native';

/** Palette brute (hex extraits du Figma). Passer par `Colors` dans les écrans. */
export const Palette = {
  evergreen: '#092C25', // brand #1 - headers, boutons primaires, nav active
  whitePP: '#F5F6F3', // fond app
  white: '#FFFFFF', // surfaces / cards
  onyx: '#101010', // texte principal
  grey: '#8C8C8C', // texte secondaire
  border: '#E0E0DE', // bordures fines
  lime: '#E6FFA5', // accent data - highlight, succès doux, podium #1
  blue: '#A5C6FF', // accent data - avatars, podium #2, chart
  purple: '#A8A5FF', // accent data - avatars, podium #3
  green: '#8CE566', // succès / victoire
  red: '#FF8C8C', // défaite / erreur (fond)
  redInk: '#CC1A1A', // défaite / erreur (texte)
} as const;

/**
 * App en MODE CLAIR. On mappe light ET dark sur le même thème clair pour forcer
 * le rendu du design quel que soit le réglage système (pas de dark mode en V1).
 */
const theme = {
  text: Palette.onyx,
  textSecondary: Palette.grey,
  textMuted: '#B4B4B2',
  background: Palette.whitePP,
  backgroundElement: Palette.white, // cards
  backgroundSelected: '#ECEDEA',
  border: Palette.border,
  brand: Palette.evergreen, // primaire / actif
  onBrand: Palette.whitePP, // texte sur evergreen
  danger: Palette.redInk,
  success: '#3FA34D',
  info: Palette.blue,
} as const;

export const Colors = { light: theme, dark: theme } as const;
export type ThemeColor = keyof typeof theme;

/**
 * Familles de police. Le Figma utilise Inter ; on garde Open Sauce (police de
 * marque Eugenia, quasi identique à Inter) déjà embarquée. Cible la famille
 * EXACTE par graisse (le fontWeight ne sélectionne pas le bon fichier).
 */
export const Fonts = {
  display: 'OpenSauceTwo-Black',
  displayBold: 'OpenSauceTwo-Bold',
  heading: 'OpenSauceTwo-ExtraBold',
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

/** Rayons. Le Figma est plutôt anguleux (cards ~6-8, pills pour pastilles). */
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
