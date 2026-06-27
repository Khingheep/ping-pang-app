import { defineConfig } from 'vitest/config';

// Suite de tests unitaires (logique pure, sans dépendances React Native).
// Les modules testés ne doivent pas importer expo / react-native.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
