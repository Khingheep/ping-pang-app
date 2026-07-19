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

/**
 * Palette brute (hex de l'export Figma « Neo » — écrans feed/Défis les plus récents).
 * Système NEUTRE : l'action primaire est neutral-900 (#171717), l'evergreen n'est
 * plus qu'un accent (texte sur lime, data-viz). Passer par `Colors` dans les écrans.
 */
export const Palette = {
  whitePP: '#F3F1F3', // fond app (neutral-100)
  white: '#FFFFFF', // surfaces / cards
  onyx: '#171717', // texte principal + action primaire (neutral-900)
  ink2: '#525252', // action secondaire / chip active (neutral-600)
  greyMid: '#7F7F7F', // neutral-500
  grey: '#A3A3A3', // texte secondaire / icônes inactives (neutral-400)
  border: '#E5E5E5', // bordures + avatars neutres (neutral-200)
  evergreen: '#092C25', // accent brand (texte sur lime, data-viz) — plus l'action primaire
  lime: '#E6FFA5', // accent highlight (Revanche, podium #1)
  blue: '#A5C6FF', // accent data - avatars, podium #2, chart
  purple: '#A8A5FF', // accent data - avatars, podium #3
  green: '#8CE566', // succès / victoire
  greenInk: '#2E9E52', // hausse de classement (texte sur blanc)
  red: '#FF8C8C', // défaite / erreur (fond)
  redInk: '#CC1A1A', // défaite / erreur (texte)
  warning: '#F5B301', // Feedback/warning - avertissement / en attente
  // Médailles podium (barres du Ranking) — couleurs dédiées, hors système neutre.
  gold: '#F5C518', // #1
  silver: '#8E8E8E', // #2
  bronze: '#A0501A', // #3
} as const;

/**
 * App en MODE CLAIR. On mappe light ET dark sur le même thème clair pour forcer
 * le rendu du design quel que soit le réglage système (pas de dark mode en V1).
 */
const theme = {
  text: Palette.onyx, // #171717
  textSecondary: Palette.grey, // #A3A3A3
  textMuted: '#C4C4C4',
  background: Palette.whitePP, // #F3F1F3
  backgroundElement: Palette.white, // cards
  backgroundSelected: Palette.border, // #E5E5E5
  border: Palette.border, // #E5E5E5
  brand: Palette.onyx, // action primaire = neutral-900 (#171717) — cf. brand-guideline Neo
  onBrand: Palette.whitePP, // texte clair sur action primaire
  danger: Palette.redInk,
  success: '#3FA34D',
  warning: '#8A6300', // texte sur fond warning
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

/**
 * Espacement — échelle du brand-guideline MVP (Auto-Layout Figma) :
 * xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32.
 * Les alias historiques (one…six) restent mappés dessus pour ne pas casser les
 * écrans déjà stylés ; le nouveau code utilise les noms sémantiques.
 */
export const Spacing = {
  xs: 4, // gap-xs · micro-espacements (icônes)
  sm: 8, // gap-sm · éléments liés
  md: 12, // gap-md · espacement par défaut
  lg: 16, // gap-lg · séparation de petits blocs
  xl: 24, // gap-xl · marges de sections
  xxl: 32, // gap-xxl · marges globales de page
  // alias historiques
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Rayons — valeurs de l'export Figma « Neo » : boutons 8, cards 16, chips/avatars pill.
 * (xs = boutons, sm = cards/inputs, md/lg = grands blocs, pill = chips & ronds.)
 */
export const Radius = {
  xs: 8, // boutons
  sm: 16, // cards, inputs
  md: 20,
  lg: 24,
  pill: 999, // chips, avatars, bouton central
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
