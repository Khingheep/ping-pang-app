// Constantes partagees des tests e2e. Surchargeables par variables d'env.
// Doit rester coherent avec e2e/provision.mjs (meme compte).
export const BASE_URL = process.env.E2E_BASE_URL || 'https://ping-pang-paris.pages.dev';
export const E2E_EMAIL = process.env.E2E_EMAIL || 'e2e-runner@pingpang.test';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eRunner!2026';
export const STORAGE_STATE = 'e2e/.auth/user.json';
