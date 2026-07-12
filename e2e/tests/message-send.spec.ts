import { test, expect } from '@playwright/test';

import { deleteMessages, peerId } from '../admin';

/**
 * TC-12 — Envoyer un message dans un chat. On ouvre la conversation avec le compte pair,
 * on tape un message et on l'envoie (Entree) ; il apparait dans le fil. Auto-nettoyage.
 */
test.afterAll(async () => {
  await deleteMessages();
});

test('TC-12 envoyer un message', async ({ page }) => {
  await deleteMessages();
  const other = await peerId();
  const body = 'Salut, message de test e2e';

  await page.goto(`/chat?id=${other}&name=E2E%20Peer`);
  const input = page.getByPlaceholder('Message…');
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(body);
  await input.press('Enter');

  await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
});
