import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { Palette } from '@/constants/theme';
import type { LatLng } from '@/lib/location/distance';
import type { Venue } from '@/lib/venues/venues';
import { mapHtml } from './venue-map-html';

export type VenueMapHandle = { focus: (id: string) => void; applyFilter: (mode: number) => void };

/** Carte (natif) : Leaflet rendu dans un react-native-webview. */
export const VenueMap = forwardRef<VenueMapHandle, { venues: Venue[]; user?: LatLng | null; onReady?: () => void }>(
  function VenueMap({ venues, user, onReady }, ref) {
    const webRef = useRef<WebView>(null);
    const html = useMemo(() => mapHtml(venues, user), [venues, user]);

    useImperativeHandle(ref, () => ({
      focus: (id) => webRef.current?.injectJavaScript(`window.__focus(${JSON.stringify(id)});true;`),
      applyFilter: (mode) => webRef.current?.injectJavaScript(`window.__filter&&window.__filter(${mode});true;`),
    }));

    return (
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        onMessage={() => {}}
        onLoadEnd={onReady}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
      />
    );
  },
);

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: Palette.whitePP } });
