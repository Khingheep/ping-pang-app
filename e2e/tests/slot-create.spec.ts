import { test, expect } from '@playwright/test';

import { anyVenueId, countSlots, deleteSlots } from '../admin';

/**
 * TC-13 — Proposer un creneau sur un lieu. On ouvre l'ecran avec un lieu reel, on choisit
 * un jour futur puis on publie ; l'alerte de succes s'affiche et +1 creneau en base.
 * Auto-nettoyage.
 */
test.afterAll(async () => {
  await deleteSlots();
});

test('TC-13 proposer un créneau', async ({ page }) => {
  await deleteSlots();
  const venue = await anyVenueId();
  const before = await countSlots();

  // Alerte de succes (window.alert web) acceptee automatiquement, message capture.
  let msg = '';
  page.on('dialog', async (d) => {
    msg = d.message();
    await d.accept();
  });

  await page.goto(`/new-slot?venueId=${venue}&venueName=Lieu%20test`);

  // Jour futur du mois courant (defaut = aujourd'hui 19h, potentiellement passe selon l'heure).
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(now.getDate() + 5, daysInMonth);
  await page.getByText(String(day), { exact: true }).click();

  await page.getByText('Publier le créneau', { exact: true }).click();

  await expect.poll(() => msg, { timeout: 20_000 }).toContain('Créneau publié');
  expect(await countSlots()).toBe(before + 1);
});
