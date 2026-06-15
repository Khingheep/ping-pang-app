// Post-traitement du build web Expo (output "single") : injecte les tags PWA dans index.html
// (le +html.tsx d'expo-router n'est pas appliqué en mode SPA). Idempotent.
// Usage: node scripts/pwa-postbuild.mjs [dist-dir]
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] || 'dist-web';
const file = `${dir}/index.html`;
let html = readFileSync(file, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('PWA tags déjà présents — rien à faire.');
  process.exit(0);
}

html = html.replace('<html lang="en">', '<html lang="fr">');
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />',
);

const head = `
    <meta name="description" content="Le club de ping-pong de Paris — matchs, classement Glicko, défis et tables près de toi." />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#092C25" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Ping Pang Paris" />
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});}</script>
  </head>`;

html = html.replace('</head>', head);
writeFileSync(file, html);
console.log('PWA tags injectés dans', file);
