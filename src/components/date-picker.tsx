import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const COL = `${100 / 7}%`;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Calendrier mensuel neutre (sélection d'un jour). Navigation mois précédent/suivant,
 * jours passés désactivés, « aujourd'hui » entouré, jour sélectionné rempli ink2.
 */
export function DatePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const startWd = (new Date(year, month, 1).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const canPrev = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
  const go = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <View style={styles.cal}>
      <View style={styles.head}>
        <Pressable onPress={() => canPrev && go(-1)} hitSlop={8} disabled={!canPrev}>
          <Ionicons name="chevron-back" size={20} color={canPrev ? Palette.onyx : Palette.border} />
        </Pressable>
        <ThemedText type="cardTitle">
          {MONTHS[month]} {year}
        </ThemedText>
        <Pressable onPress={() => go(1)} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={Palette.onyx} />
        </Pressable>
      </View>

      <View style={styles.wdRow}>
        {WEEKDAYS.map((w, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.wd}>
            {w}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <View key={i} style={styles.cell} />;
          const date = new Date(year, month, d);
          const past = date < today;
          const selected = sameDay(date, value);
          const isToday = sameDay(date, today);
          return (
            <Pressable key={i} style={styles.cell} disabled={past} onPress={() => onChange(date)}>
              <View style={[styles.day, selected && styles.daySel, !selected && isToday && styles.dayToday]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: selected ? Palette.whitePP : past ? Palette.border : Palette.onyx }}>
                  {d}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cal: { backgroundColor: Palette.white, borderRadius: Radius.sm, padding: Spacing.three },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  wdRow: { flexDirection: 'row', marginBottom: Spacing.one },
  wd: { width: COL, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: COL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: Palette.ink2 },
  dayToday: { borderWidth: 1, borderColor: Palette.border },
});
