import { Palette } from '@/constants/theme';

/** Un point affiché sur la carte (lieu/table). `slots` = nb de créneaux ouverts (→ marqueur surligné). */
export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  indoor?: boolean | null;
  slots?: number;
};

/** Cadre visible de la carte, remonté à chaque déplacement pour charger les tables du viewport. */
export type Bbox = { n: number; s: number; e: number; w: number };

/** API impérative exposée par les deux variantes de VenueMap (natif WebView / web iframe). */
export type VenueMapHandle = {
  focus: (id: string) => void;
  /** Recentre en remontant le point au-dessus du panneau (sélection d'un lieu). */
  focusAt: (lat: number, lng: number) => void;
  /** Centrage simple, sans décalage (ex : bouton « me recentrer »). */
  flyTo: (lat: number, lng: number, z?: number) => void;
};

const PARIS = { lat: 48.8566, lng: 2.3522 };

/**
 * Coquille HTML STATIQUE d'une carte Leaflet (fond CARTO Voyager, gratuit, sans clé), partagée par
 * les 2 variantes de VenueMap. Aucune donnée n'est embarquée : tout passe par des fonctions injectées
 * (`window.__setVenues`, `__setUser`, `__flyTo`, `__focus`) → la carte n'est jamais recréée, donc le
 * cadrage est préservé pendant le chargement par viewport.
 *
 * Remontées (postMessage) : `{type:'venue',id}` au tap sur une table, `{type:'bbox',bbox}` (debounce)
 * à chaque déplacement → l'app charge les tables visibles. Les tables avec créneaux ouverts sont
 * affichées avec une pastille verte portant le nombre.
 */
export function mapHtml(): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:${Palette.whitePP}}
  .leaflet-popup-content{font-family:-apple-system,system-ui,sans-serif;font-size:13px;margin:10px 12px}
  .leaflet-popup-content b{color:${Palette.evergreen}}
  .leaflet-control-attribution{font-size:9px;opacity:.5}
  .me-dot{width:16px;height:16px;border-radius:50%;background:${Palette.purple};border:3px solid #fff;box-shadow:0 0 0 5px ${Palette.purple}33}
  .slot-pin{min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:${Palette.lime};color:${Palette.evergreen};
    border:2px solid ${Palette.evergreen};font:700 12px/22px -apple-system,system-ui,sans-serif;text-align:center;
    box-shadow:0 1px 4px rgba(0,0,0,.3)}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var BLUE='${Palette.blue}', GREEN='${Palette.evergreen}', LIME='${Palette.lime}';
  var map = L.map('map',{zoomControl:false,attributionControl:true}).setView([${PARIS.lat},${PARIS.lng}],12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
    maxZoom:20, subdomains:'abcd', attribution:'© OpenStreetMap, © CARTO'
  }).addTo(map);

  var markers = {};   // id -> { m: layer, slots: number }
  var meMarker = null;

  function post(o){
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o));
    else if(window.parent && window.parent!==window) window.parent.postMessage(o,'*');
  }
  // Recentre la carte sur un point (la carte est en haut de l'écran, sans panneau qui la recouvre).
  function centerOn(lat,lng){
    var z = Math.max(map.getZoom(), 15);
    map.flyTo([lat,lng], z, {duration:.45});
  }
  function makeMarker(p){
    if(p.slots>0){
      var icon = L.divIcon({className:'', html:'<div class="slot-pin">'+p.slots+'</div>', iconSize:[24,24], iconAnchor:[12,12]});
      return L.marker([p.lat,p.lng],{icon:icon});
    }
    return L.circleMarker([p.lat,p.lng],{radius:8,weight:2,color:'#fff',fillColor:p.indoor?BLUE:GREEN,fillOpacity:1});
  }
  // Tap d'un marqueur : on remonte juste l'id (la bottom-sheet native affiche le détail, PAS de
  // popup Leaflet → un seul panneau) et on recentre la carte sur le lieu.
  function bind(m,p){
    m.on('click',function(){ post({type:'venue',id:p.id}); centerOn(p.lat,p.lng); });
  }

  // Remplace l'ensemble des marqueurs par diff (ajoute les nouveaux, retire les absents,
  // recrée ceux dont le nb de créneaux a changé). Préserve le cadrage courant.
  window.__setVenues=function(arr){
    var keep={};
    (arr||[]).forEach(function(p){
      keep[p.id]=1;
      var ex=markers[p.id];
      if(ex){ if(ex.slots===(p.slots||0)) return; map.removeLayer(ex.m); }
      var m=makeMarker(p); bind(m,p); m.addTo(map);
      markers[p.id]={m:m, slots:p.slots||0};
    });
    Object.keys(markers).forEach(function(id){ if(!keep[id]){ map.removeLayer(markers[id].m); delete markers[id]; } });
  };
  window.__setUser=function(lat,lng){
    var first=!meMarker;
    if(meMarker) meMarker.setLatLng([lat,lng]);
    else meMarker=L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="me-dot"></div>',iconSize:[16,16],iconAnchor:[8,8]})})
      .addTo(map).bindPopup('<b>Ma position</b>');
    if(first) map.setView([lat,lng],15); // première position connue → on cadre sur l'utilisateur
  };
  window.__flyTo=function(lat,lng,z){ map.flyTo([lat,lng], z||15, {duration:.5}); }; // centrage simple (ex : « me recentrer »)
  window.__focusAt=function(lat,lng){ centerOn(lat,lng); };                         // recentre sur un lieu (tap d'une carte)
  window.__focus=function(id){ var o=markers[id]; if(o){ var ll=o.m.getLatLng?o.m.getLatLng():null; if(ll){ centerOn(ll.lat,ll.lng); } } };

  // Déplacement → on remonte le cadre visible (debounce) pour charger les tables du viewport.
  var t=null;
  function emit(){
    var b=map.getBounds();
    post({type:'bbox', bbox:{n:b.getNorth(), s:b.getSouth(), e:b.getEast(), w:b.getWest()}});
  }
  map.on('moveend', function(){ clearTimeout(t); t=setTimeout(emit,250); });
  setTimeout(emit, 300); // premier chargement du viewport initial
</script></body></html>`;
}
