/**
 * 基础ESLint配置
 * 适用于所有TypeScript项目
 */
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'turbo',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // TypeScript规则
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    
    // 通用规则
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn',
    
    // 导入规则
    'sort-imports': ['error', {
      'ignoreCase': true,
      'ignoreDeclarationSort': true,
    }],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.next/',
    'coverage/',
    '*.generated.*',
  ],
}; 