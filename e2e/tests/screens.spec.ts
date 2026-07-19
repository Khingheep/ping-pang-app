import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

/**
 * Captures de contrôle visuel des écrans récemment modifiés (feed, ranking, publication).
 * Pas d'assertion « métier » : on vérifie surtout que ça REND sans casse, et on produit des
 * PNG pour revue humaine (galerie HTML générée après le run). Cible la PWA prod déployée.
 */
const DIR = 'e2e/screens';

// Légende par capture (ordre d'affichage dans la galerie).
const CAPTIONS: Record<string, { t: string; d: string }> = {
  '03-ranking.png': { t: 'Ranking (podium retravaillé)', d: 'Piliers #E5E5E5 dôme 999px, photo pleine largeur, barres collées au bas de la carte, tendance ▲/▼.' },
  '04-ranking-anchored.png': { t: 'Ranking · après la flèche', d: "Animation de défilement jusqu'à sa propre ligne." },
  '01-feed.png': { t: 'Feed', d: 'Gros boutons pilule like/commentaire.' },
  '05-publication.png': { t: 'Publication (focus post)', d: 'Mêmes gros boutons que le feed.' },
  '02-feed-matchs.png': { t: 'Feed · onglet Matchs', d: "Bascule d'onglet." },
};

test.beforeAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* dossier absent : rien à faire */
  }
  mkdirSync(DIR, { recursive: true });
});

// Génère la galerie HTML à partir des PNG réellement capturés (ordre = CAPTIONS puis le reste).
test.afterAll(() => {
  let pngs: string[];
  try {
    pngs = readdirSync(DIR).filter((f) => f.endsWith('.png'));
  } catch {
    return; // rien capturé
  }
  const ordered = [...Object.keys(CAPTIONS).filter((f) => pngs.includes(f)), ...pngs.filter((f) => !CAPTIONS[f]).sort()];
  const cards = ordered
    .map((f, i) => {
      const c = CAPTIONS[f] ?? { t: f.replace(/\.png$/, ''), d: '' };
      return `    <div class="shot"><img src="${f}" alt="${c.t}" /><div class="meta"><div class="t">${i + 1} · ${c.t}</div><div class="d">${c.d}</div></div></div>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ping Pang Paris — contrôle visuel PWA</title>
<style>
  :root{--bg:#F3F1F3;--card:#fff;--ink:#171717;--muted:#7f7f7f;--border:#e5e5e5}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  header{padding:28px 24px 8px} h1{margin:0 0 4px;font-size:24px} .sub{color:var(--muted);font-size:14px}
  .grid{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}
  .shot{background:var(--card);border:1px solid var(--border);border-radius:20px;overflow:hidden;width:300px;box-shadow:0 4px 18px rgba(0,0,0,.06)}
  .shot img{display:block;width:100%;height:auto;background:#000}
  .meta{padding:12px 14px 14px} .meta .t{font-weight:700;font-size:15px} .meta .d{color:var(--muted);font-size:13px;margin-top:3px;line-height:1.35}
</style></head><body>
  <header><h1>Ping Pang Paris — contrôle visuel</h1><div class="sub">Captures Playwright de la PWA prod (viewport mobile 412×915).</div></header>
  <div class="grid">
${cards}
  </div>
</body></html>`;
  writeFileSync(`${DIR}/index.html`, html);
});

test('captures des écrans modifiés', async ({ page }) => {
  // 1) FEED — footer gros boutons like/commentaire, image pleine largeur, carrousel
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accueil' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1800); // laisse charger le feed + images
  await page.screenshot({ path: `${DIR}/01-feed.png` });

  // 2) FEED onglet Matchs
  await page.getByText('Matchs', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/02-feed-matchs.png` });

  // 3) RANKING — podium barres or/argent/bronze, carte « Tu es classé », tendance ▲/▼
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByText('Ranking', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${DIR}/03-ranking.png` });

  // 4) RANKING après appui sur la flèche → animation de défilement jusqu'à sa ligne
  const anchor = page.getByTestId('rank-anchor');
  if (await anchor.count()) {
    await anchor.click();
    await page.waitForTimeout(2400); // le temps que l'anim se termine
    await page.screenshot({ path: `${DIR}/04-ranking-anchored.png` });
  }

  // 5) PUBLICATION (focus post) — mêmes gros boutons like/commentaire
  await page.goto('/');
  await page.waitForTimeout(1400);
  await page.getByText('Séance', { exact: false }).first().click();
  await expect(page.getByText('Publication')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${DIR}/05-publication.png` });
});
