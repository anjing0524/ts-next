import { createBaseConfig } from '@repo/eslint-config/flat';

export default createBaseConfig({
  extends: ['eslint:recommended', '@typescript-eslint/recommended', 'turbo', 'prettier'],
});
