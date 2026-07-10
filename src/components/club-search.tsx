/**
 * Sélecteur de club/lieu réutilisable (onboarding inline + modale de profil).
 * Recherche par nom dans `venues` ; affiche le lieu sélectionné en tête avec une coche.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { searchVenues, type Venue } from '@/lib/venues/venues';

export function ClubSearch({
  selected,
  onSelect,
}: {
  selected: Venue | null;
  onSelect: (v: Venue | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Venue[]>([]);

  useEffect(() => {
    let alive = true;
    searchVenues(query).then((r) => {
      if (alive) setResults(r);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <View style={styles.wrap}>
      {selected ? (
        <View style={styles.selected}>
          <View style={styles.selIcon}>
            <Ionicons name={selected.indoor ? 'home' : 'sunny'} size={18} color={Palette.onyx} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="cardTitle" numberOfLines={1}>
              {selected.name}
            </ThemedText>
            {selected.address ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {selected.address}
              </ThemedText>
            ) : null}
          </View>
          <Pressable onPress={() => onSelect(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={Palette.grey} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Palette.grey} />
        <TextInput
          style={styles.input}
          placeholder="Chercher un club, un gymnase, un parc…"
          placeholderTextColor={Palette.grey}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      <View style={styles.list}>
        {results.map((v) => {
          const on = selected?.id === v.id;
          return (
            <Pressable key={v.id} style={[styles.row, on && styles.rowOn]} onPress={() => onSelect(v)}>
              <View style={[styles.pin, { backgroundColor: v.indoor ? Palette.blue : Palette.lime }]}>
                <Ionicons name={v.indoor ? 'home' : 'sunny'} size={15} color={Palette.onyx} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {v.name}
                </ThemedText>
                {v.address ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {v.address}
                  </ThemedText>
                ) : null}
              </View>
              {on ? <Ionicons name="checkmark-circle" size={20} color={Palette.onyx} /> : null}
            </Pressable>
          );
        })}
        {query.trim() && results.length === 0 ? (
          <ThemedText type="small" themeColor="textMuted" style={styles.empty}>
            Aucun lieu à ce nom. Essaie un autre mot.
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, marginTop: Spacing.three },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.lime,
    borderWidth: 1,
    borderColor: Palette.onyx,
    borderRadius: Radius.sm,
    padding: Spacing.three,
  },
  selIcon: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Palette.whitePP, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, height: 50, color: Palette.onyx, fontFamily: 'OpenSauceOne-Regular', fontSize: 15 },
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.two,
  },
  rowOn: { borderColor: Palette.onyx },
  pin: { width: 32, height: 32, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: Spacing.three },
});
