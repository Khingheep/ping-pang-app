import { test, expect } from '@playwright/test';

/**
 * TC-01 — Sans session, l'app renvoie vers l'ecran d'accueil (welcome).
 * Aucune storageState ici (projet `anon`), donc le RootNavigator doit rediriger.
 */
test('TC-01 sans session -> welcome', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Créer un compte')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('La communauté du ping-pong parisien.')).toBeVisible();
  await expect(page.getByText("J'ai déjà un compte")).toBeVisible();
});
