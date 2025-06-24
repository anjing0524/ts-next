// ESLint Flat Config 格式的配置
// ESLint Flat Config format configuration

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import importPlugin from 'eslint-plugin-import';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * 创建基础ESLint配置
 * @param {Object} options - 配置选项
 * @param {string[]} options.extends - 要扩展的配置
 * @param {boolean} options.includeImportPlugin - 是否包含import插件
 * @returns {Array} ESLint配置数组
 */
export function createBaseConfig(options = {}) {
  const { extends: extendsConfig = [], includeImportPlugin = true } = options;
  
  const config = [
    // 扩展指定的配置
    ...compat.extends(...extendsConfig),
  ];

  // 添加 import 插件配置
  if (includeImportPlugin) {
    config.push({
      plugins: {
        import: importPlugin,
      },
      rules: {
        'import/order': [
          'warn',
          {
            groups: [
              'builtin',
              'external', 
              'internal',
              ['parent', 'sibling', 'index'],
              'object',
              'type',
            ],
            pathGroups: [
              {
                pattern: '{react,react-dom/**,next,next/**}',
                group: 'external',
                position: 'before',
              },
              {
                pattern: '@/**',
                group: 'internal',
              },
            ],
            pathGroupsExcludedImportTypes: ['react', 'type'],
            'newlines-between': 'always',
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],
        'import/no-unresolved': 'off',
        'import/no-duplicates': 'warn',
      },
      settings: {
        'import/resolver': {
          typescript: {
            project: './tsconfig.json',
          },
          node: true,
        },
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
      },
    });
  }

  // 全局忽略模式
  config.push({
    ignores: ['node_modules/', '.next/', 'out/', 'logs/', 'public/wasm-cal/', 'dist/', 'coverage/'],
  });

  return config;
}

/**
 * 创建Next.js应用的ESLint配置
 * @param {Object} options - 配置选项
 * @returns {Array} ESLint配置数组
 */
export function createNextConfig(options = {}) {
  return createBaseConfig({
    extends: ['next/core-web-vitals', 'next/typescript', 'prettier'],
    ...options,
  });
}

/**
 * 创建库包的ESLint配置
 * @param {Object} options - 配置选项
 * @returns {Array} ESLint配置数组
 */
export function createLibConfig(options = {}) {
  return createBaseConfig({
    extends: ['eslint:recommended', '@typescript-eslint/recommended', 'turbo', 'prettier'],
    ...options,
  });
} 