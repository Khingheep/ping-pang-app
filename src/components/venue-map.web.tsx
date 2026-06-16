import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

import type { Venue } from '@/lib/venues/venues';
import { mapHtml } from './venue-map-html';

export type VenueMapHandle = { focus: (id: string) => void; applyFilter: (mode: number) => void };

/** Carte (web) : Leaflet rendu dans une iframe srcDoc (react-native-webview n'a pas de support web). */
export const VenueMap = forwardRef<VenueMapHandle, { venues: Venue[]; onReady?: () => void }>(function VenueMap(
  { venues, onReady },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => mapHtml(venues), [venues]);

  useImperativeHandle(ref, () => ({
    // srcDoc => iframe same-origin (about:srcdoc) : on accède à window.__focus / __filter directement.
    focus: (id) => {
      try {
        (iframeRef.current?.contentWindow as unknown as { __focus?: (id: string) => void } | undefined)?.__focus?.(id);
      } catch {
        /* no-op */
      }
    },
    applyFilter: (mode) => {
      try {
        (
          iframeRef.current?.contentWindow as unknown as { __filter?: (mode: number) => void } | undefined
        )?.__filter?.(mode);
      } catch {
        /* no-op */
      }
    },
  }));

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="Carte des tables"
      onLoad={onReady}
      style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
});
