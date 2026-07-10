/**
 * Sélecteur de GIF (Giphy) présenté en bottom-sheet.
 * La clé API se lit dans `EXPO_PUBLIC_GIPHY_KEY` (.env). Sans clé, on l'indique à l'utilisateur.
 * (Tenor n'accepte plus de nouveaux clients API depuis janvier 2026 → bascule sur Giphy.)
 * `onSelect(url)` renvoie l'URL du GIF plein format ; le parent l'envoie comme message.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SwipeSheet } from '@/components/swipe-sheet';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const GIPHY_KEY = process.env.EXPO_PUBLIC_GIPHY_KEY;
const LIMIT = 24;

type Gif = { id: string; preview: string; full: string };

type GiphyImage = { url?: string };
type GiphyResult = {
  id: string;
  images?: {
    fixed_width?: GiphyImage; // plein format léger (envoyé)
    fixed_width_small?: GiphyImage; // vignette de la grille
    downsized?: GiphyImage;
    original?: GiphyImage;
  };
};

function mapResults(json: { data?: GiphyResult[] }): Gif[] {
  return (json.data ?? [])
    .map((r) => {
      const full = r.images?.fixed_width?.url ?? r.images?.downsized?.url ?? r.images?.original?.url;
      const preview = r.images?.fixed_width_small?.url ?? full;
      return full && preview ? { id: r.id, preview, full } : null;
    })
    .filter((g): g is Gif => !!g);
}

export function GifPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    if (!GIPHY_KEY) return;
    setLoading(true);
    try {
      const url = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q.trim())}&limit=${LIMIT}&rating=pg-13&lang=fr`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=${LIMIT}&rating=pg-13`;
      const res = await fetch(url);
      const json = await res.json();
      setGifs(mapResults(json));
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charge les tendances à l'ouverture, et recherche (debounce) à la frappe.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => load(query), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [visible, query, load]);

  return (
    <SwipeSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Palette.grey} />
        <TextInput
          style={styles.search}
          placeholder="Rechercher un GIF…"
          placeholderTextColor={Palette.grey}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={Palette.onyx} />
        </Pressable>
      </View>

      {!GIPHY_KEY ? (
        <View style={styles.center}>
          <ThemedText type="default" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Les GIFs nécessitent une clé Giphy.{'\n'}Ajoute EXPO_PUBLIC_GIPHY_KEY dans ton .env.
          </ThemedText>
        </View>
      ) : loading && !gifs.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={Palette.onyx} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={gifs}
          keyExtractor={(g) => g.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: Spacing.two }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.gifCell}
              onPress={() => {
                onSelect(item.full);
                onClose();
              }}>
              <Image source={{ uri: item.preview }} style={styles.gifImg} resizeMode="cover" />
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.center}>
                <ThemedText type="default" themeColor="textMuted">
                  Aucun GIF trouvé.
                </ThemedText>
              </View>
            ) : null
          }
        />
      )}
    </SwipeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { height: '72%', paddingHorizontal: Spacing.four },
  list: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Radius.pill,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  search: { flex: 1, color: Palette.onyx, fontFamily: 'OpenSauceOne-Regular', fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six },
  grid: { gap: Spacing.two, paddingBottom: Spacing.four },
  gifCell: { flex: 1, aspectRatio: 1, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Palette.white },
  gifImg: { width: '100%', height: '100%' },
});
