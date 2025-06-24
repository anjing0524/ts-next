/**
 * Next.js ESLint配置
 * 适用于所有Next.js应用
 */
module.exports = {
  extends: ['eslint:recommended'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    // 允许在开发环境使用console
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    
    // 一些基本规则
    'no-unused-vars': 'warn',
    'no-undef': 'off', // TypeScript 会处理这个
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
