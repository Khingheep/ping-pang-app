import { test, expect } from '@playwright/test';

import { countTournaments, deleteTournaments } from '../admin';

/**
 * TC-11 — Creer un tournoi via l'UI. Apres creation, l'app redirige vers l'ecran du
 * tournoi (qui affiche son nom) et une ligne existe en base. Auto-nettoyage.
 */
test.afterAll(async () => {
  await deleteTournaments();
});

test('TC-11 créer un tournoi', async ({ page }) => {
  await deleteTournaments();
  const before = await countTournaments();
  const name = 'Tournoi e2e';

  await page.goto('/tournoi-new');
  await page.getByPlaceholder('Ex : Tournoi du dimanche').fill(name);
  await page.getByText('Créer le tournoi', { exact: true }).click();

  // Redirection vers l'ecran du tournoi : le nom s'affiche.
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  expect(await countTournaments()).toBe(before + 1);
});
