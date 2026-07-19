import { test, expect } from '@playwright/test';

/**
 * Régression bug designer (16/07) : sur le web, « Signaler ce joueur » puis « Annuler »
 * envoyait quand même le signalement (window.confirm : « Annuler » déclenchait option[1]).
 * On vérifie que : la feuille s'ouvre, « Annuler » la ferme, et AUCUNE alerte « envoyé ».
 */
test('signalement : « Annuler » n’envoie aucun signalement', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  // Ouvre le profil du #1 du classement (podium) → un joueur ≠ compte de test (bouton Signaler visible).
  await page.goto('/classement');
  await expect(page.getByText('Ranking', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.getByText(/Antoine/).first().click();

  await expect(page.getByText('Signaler ce joueur')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Signaler ce joueur').click();

  // La feuille s'ouvre (titre « Signaler X ? »).
  await expect(page.getByText(/Signaler .+\?/)).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screens/06-report-sheet.png' });

  // Annuler → doit juste fermer, sans rien envoyer.
  await page.getByText('Annuler', { exact: true }).click();
  await page.waitForTimeout(1000);

  expect(dialogs.join(' | ')).not.toContain('Signalement envoyé');
});
