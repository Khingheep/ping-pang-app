import { defineConfig } from '@playwright/test';

import { BASE_URL, STORAGE_STATE } from './e2e/creds';

/**
 * Tests e2e de la PWA Ping Pang Paris (cf. docs/TESTING-E2E.md).
 * Cible par defaut la PWA deployee (E2E_BASE_URL pour surcharger). Le projet `setup`
 * se connecte une fois et sauvegarde la session ; les tests authentifies la reutilisent.
 * Viewport mobile portrait (usage reel = telephone). 1 worker : on tape la vraie base prod.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 412, height: 915 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    // 1) Connexion unique -> storageState reutilise par les tests authentifies.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // 2) Tests sans session (redirection welcome).
    { name: 'anon', testMatch: /.*\.anon\.spec\.ts/ },

    // 3) Tests authentifies (reutilisent la session).
    {
      name: 'authed',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /.*\.anon\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE },
    },
  ],
});
