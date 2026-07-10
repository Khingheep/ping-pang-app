import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

/**
 * Tuile-bouton avec image en fond qui déborde à droite + dégradé de fondu.
 * Portée du DashboardActionTile d'equipe2-training (cf. design « beau bouton image »).
 */
export function ActionTile({
  title,
  subtitle,
  image,
  onPress,
  icon = 'arrow-forward',
}: {
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      {/* Image : déborde sur la moitié droite */}
      <Image source={image} style={styles.image} contentFit="cover" />
      {/* Fondu evergreen → transparent (gauche vers droite) pour lisibilité du texte */}
      <LinearGradient
        colors={['rgba(23,23,23,0.98)', 'rgba(23,23,23,0.55)', 'rgba(23,23,23,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View>
          <ThemedText type="sectionTitle" themeColor="onBrand" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        </View>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={18} color={Palette.lime} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 132,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Palette.onyx,
    justifyContent: 'center',
  },
  image: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '62%' },
  content: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'space-between',
    maxWidth: '74%',
  },
  title: { textTransform: 'uppercase', letterSpacing: 0.3 },
  subtitle: { color: 'rgba(246,246,243,0.75)', marginTop: Spacing.one },
  iconCircle: {
    marginTop: Spacing.three,
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(230,255,165,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
