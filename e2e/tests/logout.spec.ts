import { test, expect } from '@playwright/test';

/**
 * TC-10 — Deconnexion. Se deconnecter depuis les reglages vide la session -> le
 * RootNavigator renvoie vers welcome. Contexte isole (storageState fichier inchange),
 * donc sans effet sur les autres tests.
 */
test('TC-10 déconnexion -> welcome', async ({ page }) => {
  await page.goto('/settings');
  const logout = page.getByText('Se déconnecter');
  await expect(logout).toBeVisible({ timeout: 30_000 });
  await logout.click();

  await expect(page.getByText('Créer un compte')).toBeVisible({ timeout: 30_000 });
});
