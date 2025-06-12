import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Node environment for all tests
  {
    extends: './vitest.config.ts',
    test: {
      name: 'api',
      environment: 'node',
      include: ['**/__tests__/**/*.test.[j|t]s?(x)'],
      setupFiles: ['./vitest.setup.ts'],
    },
  },
]);
