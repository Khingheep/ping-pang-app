import { Palette } from '@/constants/theme';
import type { LatLng } from '@/lib/location/distance';
import type { Venue } from '@/lib/venues/venues';

const PARIS = { lat: 48.8566, lng: 2.3522 };

/**
 * HTML d'une carte Leaflet/OpenStreetMap, partagé par les 2 variantes de VenueMap
 * (WebView natif / iframe web). Expose `window.__focus(id)` pour centrer sur un lieu.
 * `user` (optionnel) affiche un marqueur « moi » et inclut la position dans le cadrage.
 */
export function mapHtml(venues: Venue[], user?: LatLng | null): string {
  const points = venues
    .filter((v) => v.lat != null && v.lng != null)
    .map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, name: v.name, address: v.address ?? '', indoor: !!v.indoor }));
  const data = JSON.stringify(points).replace(/</g, '\\u003c');
  const me = user ? JSON.stringify(user).replace(/</g, '\\u003c') : 'null';
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:${Palette.whitePP}}
  .leaflet-popup-content{font-family:-apple-system,system-ui,sans-serif;font-size:13px;margin:10px 12px}
  .leaflet-popup-content b{color:${Palette.evergreen}}
  .leaflet-control-attribution{font-size:9px;opacity:.5}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map',{zoomControl:false,attributionControl:true}).setView([${PARIS.lat},${PARIS.lng}],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var pts = ${data};
  var me = ${me};
  var markers = {}, all = [], bounds = [];
  pts.forEach(function(p){
    var m = L.circleMarker([p.lat,p.lng],{radius:9,weight:2,color:'${Palette.evergreen}',
      fillColor:p.indoor?'${Palette.blue}':'${Palette.lime}',fillOpacity:1}).addTo(map);
    m.bindPopup('<b>'+p.name+'</b>'+(p.address?'<br>'+p.address:''));
    m.on('click',function(){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(p.id); });
    markers[p.id]=m; all.push({m:m,indoor:p.indoor}); bounds.push([p.lat,p.lng]);
  });
  if(me){
    L.circleMarker([me.lat,me.lng],{radius:8,weight:3,color:'#fff',
      fillColor:'${Palette.purple}',fillOpacity:1}).addTo(map).bindPopup('<b>Ma position</b>');
    bounds.push([me.lat,me.lng]);
  }
  if(bounds.length) map.fitBounds(bounds,{padding:[36,36],maxZoom:14});
  window.__focus=function(id){ var m=markers[id]; if(m){ map.flyTo(m.getLatLng(),15,{duration:.6}); m.openPopup(); } };
  // mode: 0=tout, 1=intérieur, 2=extérieur — masque/affiche les marqueurs sans recharger.
  window.__filter=function(mode){
    var vis=[];
    all.forEach(function(o){
      var show = mode===0 || (mode===1 && o.indoor) || (mode===2 && !o.indoor);
      if(show){ o.m.addTo(map); vis.push(o.m.getLatLng()); } else { map.removeLayer(o.m); }
    });
    if(vis.length) map.fitBounds(vis,{padding:[36,36],maxZoom:14});
  };
</script></body></html>`;
}
