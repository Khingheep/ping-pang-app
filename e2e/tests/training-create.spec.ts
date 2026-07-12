import { test, expect } from '@playwright/test';

import { countSessions, deleteSessions } from '../admin';

/**
 * TC-08 — Creer une seance via l'UI (parcours complet du wizard) et verifier qu'elle
 * apparait cote client ET cote base. Le compte de test est remis a plat avant/apres.
 */
test.afterAll(async () => {
  await deleteSessions();
});

test("TC-08 créer une séance via le wizard", async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // window.alert de succes (notify web)
  await deleteSessions();
  const before = await countSessions();

  await page.goto('/train');
  await expect(page.getByText(/Aucune séance enregistrée/)).toBeVisible({ timeout: 30_000 });

  // Ouvre le wizard depuis le CTA "J'ai joué".
  await page.getByText(/J'ai joué/).click();

  // Etape 1/5 (WORK) : choisir un coup (seul champ requis du flow).
  await page.getByText('Coup droit', { exact: true }).click();
  await expect(page.getByText('1/5')).toBeVisible();

  // Etapes 2..5 : "Continuer" en attendant l'increment du compteur d'etape (evite les
  // clics avales pendant la transition).
  for (const n of [2, 3, 4, 5]) {
    await page.getByText('Continuer', { exact: true }).click();
    await expect(page.getByText(`${n}/5`)).toBeVisible();
  }

  // Dernier ecran : enregistrer -> retour sur Train (le hero, absent du wizard, confirme
  // la navigation retour et donc que la sauvegarde a bien eu lieu).
  await page.getByText('Enregistrer la séance', { exact: true }).click();
  await expect(page.getByTestId('train-hero')).toBeVisible({ timeout: 30_000 });

  // L'etat vide disparait, la seance apparait dans "Mes séances".
  await expect(page.getByText(/Aucune séance enregistrée/)).toBeHidden();
  await expect(page.getByText('Coup droit').first()).toBeVisible();

  // Persistance cote base : +1 seance.
  expect(await countSessions()).toBe(before + 1);
});
