import { test as setup, expect } from '@playwright/test';

import { E2E_EMAIL, E2E_PASSWORD, STORAGE_STATE } from '../creds';

/**
 * Connexion email + mot de passe (compte e2e provisionne), puis sauvegarde de la session.
 * La session Supabase vit dans le localStorage web -> storageState la capture pour les
 * autres tests (pas besoin de se reconnecter a chaque fois).
 */
setup('authentification', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('Email').fill(E2E_EMAIL);
  await page.getByPlaceholder('Mot de passe').fill(E2E_PASSWORD);
  await page.getByText('Se connecter', { exact: true }).click();

  // Arrivee dans les onglets : la tab bar (aria-label "Accueil") devient visible.
  await expect(page.getByRole('button', { name: 'Accueil' })).toBeVisible({ timeout: 30_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
