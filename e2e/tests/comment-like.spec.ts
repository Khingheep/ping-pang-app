import { test, expect } from '@playwright/test';

import { deleteSessions, seedSessionId, sessionCommentAceCount } from '../admin';

/**
 * « Ace » (like) d'un commentaire, de bout en bout : on seede une séance du compte de test,
 * on poste un commentaire via l'UI, on met un ace dessus, et on vérifie que l'ace est bien
 * PERSISTÉ en base (pas juste un état optimiste). Nettoyage : suppression de la séance seedée
 * (cascade → commentaires + likes). N'affecte que le compte de test.
 */
test.afterAll(async () => {
  await deleteSessions();
});

test('ace sur un commentaire → persisté en base', async ({ page }) => {
  const sessionId = await seedSessionId({ durationMin: 75 });

  await page.goto(`/session?id=${sessionId}`);
  await expect(page.getByText('Publication')).toBeVisible({ timeout: 30_000 });

  // Poste un commentaire (le champ est multiline → on clique le bouton d'envoi).
  const body = 'Commentaire e2e ace';
  await page.getByPlaceholder('Ajouter un commentaire…').fill(body);
  await page.getByTestId('comment-send').click();
  await expect(page.getByText(body)).toBeVisible({ timeout: 15_000 });

  // Met un ace sur le commentaire.
  await page.getByTestId('comment-ace').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screens/09-comment-ace.png' });

  // Persistance en base.
  expect(await sessionCommentAceCount(sessionId)).toBe(1);

  // Recharge : l'ace tient toujours.
  await page.reload();
  await expect(page.getByText(body)).toBeVisible({ timeout: 20_000 });
  expect(await sessionCommentAceCount(sessionId)).toBe(1);
});
