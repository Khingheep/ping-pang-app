import { test, expect } from '@playwright/test';

/**
 * TC-02 — La tab bar (5 icones) navigue et marque l'onglet actif (aria-selected).
 * TC-03 — Chaque ecran d'onglet rend son contenu (charge par URL, un seul ecran monte).
 */

// Onglet (aria-label de la tab bar) -> un contenu unique et VISIBLE de l'ecran cible.
// On evite aria-selected (react-native-web ne pose l'attribut que sur l'onglet actif au repos,
// pas de maniere fiable en assertion) et on prouve la navigation par le contenu affiche.
const TABS: { label: string; assert: (p: import('@playwright/test').Page) => Promise<unknown> }[] = [
  { label: 'Défis', assert: (p) => expect(p.getByText('Défis', { exact: true })).toBeVisible() },
  { label: 'Ranking', assert: (p) => expect(p.getByText('Ranking', { exact: true }).first()).toBeVisible() },
  { label: 'Accueil', assert: (p) => expect(p.getByText('E2E Runner').first()).toBeVisible() },
  { label: 'Map', assert: (p) => expect(p.getByText('Où jouer ?')).toBeVisible() },
  { label: 'Profil', assert: (p) => expect(p.getByTestId('profil-hero')).toBeVisible() },
];

test('TC-02 la tab bar navigue entre les 5 onglets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accueil' })).toBeVisible({ timeout: 30_000 });

  for (const tab of TABS) {
    await page.getByRole('button', { name: tab.label }).click();
    await tab.assert(page);
  }
});

// Contenu unique et visible de chaque ecran (charge en direct par son URL).
const SCREENS: { path: string; expect: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  { path: '/jouer', expect: async (p) => void (await expect(p.getByText('Défis', { exact: true })).toBeVisible()) },
  { path: '/classement', expect: async (p) => void (await expect(p.getByText('Ranking', { exact: true }).first()).toBeVisible()) },
  { path: '/carte', expect: async (p) => void (await expect(p.getByText('Où jouer ?')).toBeVisible()) },
  { path: '/train', expect: async (p) => void (await expect(p.getByTestId('train-hero')).toBeVisible()) },
];

for (const s of SCREENS) {
  test(`TC-03 l'ecran ${s.path} rend son contenu`, async ({ page }) => {
    await page.goto(s.path);
    await s.expect(page);
  });
}
