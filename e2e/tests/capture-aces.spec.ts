import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Capture ponctuelle : focus post (compteur aces + boutons) et écran Aces (likers + Suivre). */
test('captures focus post + aces', async ({ page }) => {
  mkdirSync('e2e/screens', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accueil' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  await page.getByText('Séance', { exact: false }).first().click();
  await expect(page.getByText('Publication')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screens/07-focus-post.png' });

  // Récupère l'id de la séance et ouvre l'écran Aces directement (le clic sur le compteur
  // navigue au runtime ; Playwright peine juste sur les divs imbriqués de react-native-web).
  const sessionId = new URL(page.url()).searchParams.get('id');
  await page.goto(`/aces?kind=session&id=${sessionId}`);
  await expect(page.getByText('Aces', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screens/08-aces.png' });

  console.log('PAGE ERRORS:', errors.slice(0, 6).join(' || ') || 'none');
});
