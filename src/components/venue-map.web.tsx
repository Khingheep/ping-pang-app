import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

import type { Venue } from '@/lib/venues/venues';
import { mapHtml } from './venue-map-html';

export type VenueMapHandle = { focus: (id: string) => void };

/** Carte (web) : Leaflet rendu dans une iframe srcDoc (react-native-webview n'a pas de support web). */
export const VenueMap = forwardRef<VenueMapHandle, { venues: Venue[] }>(function VenueMap({ venues }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => mapHtml(venues), [venues]);

  useImperativeHandle(ref, () => ({
    focus: (id) => {
      try {
        // srcDoc => iframe same-origin (about:srcdoc) : on accède à window.__focus directement.
        (iframeRef.current?.contentWindow as unknown as { __focus?: (id: string) => void } | undefined)?.__focus?.(id);
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
      style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
});
