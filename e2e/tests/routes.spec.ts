import { test, expect } from '@playwright/test';

/**
 * TC-09 — Les ecrans secondaires (hors tab bar) rendent leur contenu en deep-link direct.
 */
const ROUTES: { path: string; text: string }[] = [
  { path: '/mes-seances', text: 'Mes séances' },
  { path: '/mes-tournois', text: 'Mes tournois' },
  { path: '/notifications', text: 'Notifications' },
  { path: '/profile', text: 'E2E Runner' },
  { path: '/settings', text: 'Se déconnecter' },
];

for (const r of ROUTES) {
  test(`TC-09 ${r.path} rend son contenu`, async ({ page }) => {
    await page.goto(r.path);
    await expect(page.getByText(r.text).first()).toBeVisible({ timeout: 30_000 });
  });
}
