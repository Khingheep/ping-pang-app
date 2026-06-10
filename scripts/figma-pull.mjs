// Pull Figma screens (PNG) + extract design tokens from node JSON.
// Usage: node scripts/figma-pull.mjs   (reads FIGMA_API_KEY from env)
import { writeFileSync } from 'node:fs';

const TOKEN = process.env.FIGMA_API_KEY;
const FILE = 'softmt7NtS3OdMHYDdWSk1';
if (!TOKEN) {
  console.error('FIGMA_API_KEY manquant');
  process.exit(2);
}

const screens = [
  ['99:3', 'on-01-welcome'],
  ['99:19', 'on-02-interets'],
  ['99:47', 'on-03-type-joueur'],
  ['99:72', 'on-04-finaliser'],
  ['99:100', 'on-05-merci'],
  ['99:112', 'app-01-defis'],
  ['99:178', 'app-02-ranking'],
  ['99:255', 'app-03-accueil'],
  ['99:320', 'app-04-map'],
  ['99:370', 'app-05-entrainements'],
];
const headers = { 'X-Figma-Token': TOKEN };
const ids = screens.map((s) => s[0]).join(',');

// 1) Render PNGs
const imgRes = await fetch(
  `https://api.figma.com/v1/images/${FILE}?ids=${encodeURIComponent(ids)}&format=png&scale=2`,
  { headers },
).then((r) => r.json());
for (const [id, name] of screens) {
  const url = imgRes.images?.[id];
  if (!url) {
    console.log('NO IMG', id);
    continue;
  }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(`design/figma/${name}.png`, buf);
  console.log('saved', name, buf.length, 'bytes');
}

// 2) Node JSON for token extraction
const nodes = await fetch(`https://api.figma.com/v1/files/${FILE}/nodes?ids=${encodeURIComponent(ids)}`, {
  headers,
}).then((r) => r.json());
writeFileSync('design/figma/nodes.json', JSON.stringify(nodes));

const toHex = (c) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const fills = new Map(); // hex -> count
const texts = new Map(); // "family|weight|size" -> {count, sample}
function walk(n) {
  if (Array.isArray(n.fills)) {
    for (const f of n.fills) {
      if (f.type === 'SOLID' && f.visible !== false) {
        const hex = toHex(f.color);
        fills.set(hex, (fills.get(hex) || 0) + 1);
      }
    }
  }
  if (n.type === 'TEXT' && n.style) {
    const k = `${n.style.fontFamily}|${n.style.fontWeight}|${Math.round(n.style.fontSize)}`;
    const e = texts.get(k) || { count: 0, sample: (n.characters || '').slice(0, 28) };
    e.count++;
    texts.set(k, e);
  }
  for (const c of n.children || []) walk(c);
}
for (const id of Object.keys(nodes.nodes || {})) walk(nodes.nodes[id].document);

console.log('\n=== TOP FILL COLORS (hex: count) ===');
[...fills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([h, c]) => console.log(`  ${h}  x${c}`));
console.log('\n=== TEXT STYLES (family|weight|size: count) ===');
[...texts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20).forEach(([k, e]) => console.log(`  ${k}  x${e.count}  "${e.sample}"`));
