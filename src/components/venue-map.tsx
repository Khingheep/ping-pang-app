import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Palette } from '@/constants/theme';
import type { LatLng } from '@/lib/location/distance';
import { type Bbox, type MapPoint, type VenueMapHandle, mapHtml } from './venue-map-html';

export type { Bbox, MapPoint, VenueMapHandle };

type Props = {
  points: MapPoint[];
  user?: LatLng | null;
  onReady?: () => void;
  onSelectVenue?: (id: string) => void;
  onBoundsChange?: (b: Bbox) => void;
};

/**
 * Carte (natif) : WebView Leaflet (fond CARTO Voyager) partageant la coquille HTML statique
 * `mapHtml()` avec la variante web (iframe). Tourne dans Expo Go - aucun module natif requis.
 *
 * Les données ne sont jamais embarquées dans le HTML : on les pousse par `injectJavaScript`
 * (`__setVenues`, `__setUser`, …) → la carte n'est jamais recréée, le cadrage est préservé pendant
 * le chargement par viewport. Le HTML remonte `{type:'venue',id}` au tap et `{type:'bbox',bbox}`
 * (debounce) au déplacement. Mêmes props & VenueMapHandle que la variante web (carte.tsx inchangé).
 */
export const VenueMap = forwardRef<VenueMapHandle, Props>(function VenueMap(
  { points, user, onReady, onSelectVenue, onBoundsChange },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const ready = useRef(false);
  // HTML calculé UNE fois (sinon nouveau string à chaque render → la WebView se recharge en boucle).
  const html = useMemo(() => mapHtml(), []);
  // Dernières données → re-poussées dès que la carte est prête (évite de perdre un setVenues précoce).
  const latest = useRef({ points, user });
  latest.current = { points, user };

  // Exécute du JS dans la WebView (le `true;` final évite un warning iOS sur la valeur de retour).
  const run = (js: string) => webRef.current?.injectJavaScript(`${js};true;`);

  const pushVenues = (pts: MapPoint[]) => run(`window.__setVenues && window.__setVenues(${JSON.stringify(pts)})`);
  const pushUser = (u?: LatLng | null) => {
    if (u) run(`window.__setUser && window.__setUser(${u.lat},${u.lng})`);
  };

  // Pousse points + position quand ils changent (no-op tant que la carte n'est pas prête).
  if (ready.current) {
    pushVenues(points);
    pushUser(user);
  }

  const onLoadEnd = () => {
    ready.current = true;
    pushVenues(latest.current.points);
    pushUser(latest.current.user);
    onReady?.();
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string; id?: string; bbox?: Bbox };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'venue' && msg.id) onSelectVenue?.(msg.id);
    else if (msg.type === 'bbox' && msg.bbox) onBoundsChange?.(msg.bbox);
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: (id) => run(`window.__focus && window.__focus(${JSON.stringify(id)})`),
      focusAt: (lat, lng) => run(`window.__focusAt && window.__focusAt(${lat},${lng})`),
      flyTo: (lat, lng, z) => run(`window.__flyTo && window.__flyTo(${lat},${lng},${z ?? 15})`),
    }),
    [],
  );

  return (
    <WebView
      ref={webRef}
      style={styles.map}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      onLoadEnd={onLoadEnd}
      javaScriptEnabled
      domStorageEnabled
      // La carte gère sa propre zone scrollable ; pas de rebond parasite sur iOS.
      bounces={false}
      overScrollMode="never"
    />
  );
});

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: Palette.whitePP } });
