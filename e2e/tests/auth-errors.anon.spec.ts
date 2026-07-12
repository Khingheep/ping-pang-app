import { test, expect } from '@playwright/test';

import { E2E_EMAIL } from '../creds';

/**
 * TC-05 — Robustesse du login. Sur le web notify() = window.alert, qui BLOQUE le JS
 * pendant le clic : on enregistre un handler 'dialog' AVANT le clic (il accepte et
 * debloque), et on capture le message pour l'asserter.
 */

test('TC-05a login sans identifiants -> champs requis', async ({ page }) => {
  await page.goto('/login');
  let msg = '';
  page.once('dialog', async (d) => {
    msg = d.message();
    await d.accept();
  });
  await page.getByText('Se connecter', { exact: true }).click();
  expect(msg).toContain('Champs requis');
  await expect(page.getByPlaceholder('Email')).toBeVisible(); // reste sur le login
});

test('TC-05b mauvais mot de passe -> erreur, reste sur le login', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(E2E_EMAIL);
  await page.getByPlaceholder('Mot de passe').fill('mauvais-mot-de-passe');

  let msg = '';
  page.once('dialog', async (d) => {
    msg = d.message();
    await d.accept();
  });
  await page.getByText('Se connecter', { exact: true }).click();
  await expect.poll(() => msg, { timeout: 20_000 }).toContain('Erreur');
  await expect(page.getByPlaceholder('Mot de passe')).toBeVisible();
});
