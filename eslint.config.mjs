// eslint.config.mjs

// 从 'path' 模块导入 dirname 函数 (Import the dirname function from the 'path' module)
import { dirname } from 'path';
// 从 'url' 模块导入 fileURLToPath 函数 (Import the fileURLToPath function from the 'url' module)
import { fileURLToPath } from 'url';
// 从 '@eslint/eslintrc' 导入 FlatCompat 类，用于兼容旧版 ESLint 配置格式
// (Import the FlatCompat class from '@eslint/eslintrc' for compatibility with older ESLint config formats)
import { FlatCompat } from '@eslint/eslintrc';
// 导入 eslint-plugin-import，增强 import/export 语句的管理和规范性
// (Import eslint-plugin-import to enhance management and consistency of import/export statements)
// 用户需要手动安装此插件: npm install eslint-plugin-import --save-dev 或 yarn add eslint-plugin-import --dev
// (User needs to install this plugin manually: npm install eslint-plugin-import --save-dev or yarn add eslint-plugin-import --dev)
import importPlugin from 'eslint-plugin-import';

// 获取当前文件的完整路径 (Get the full path of the current file)
const __filename = fileURLToPath(import.meta.url);
// 获取当前文件所在目录的路径 (Get the path of the directory where the current file is located)
const __dirname = dirname(__filename);

// 创建 FlatCompat 实例，用于加载和转换传统的 ESLint 配置
// (Create a FlatCompat instance for loading and converting traditional ESLint configurations)
const compat = new FlatCompat({
  baseDirectory: __dirname, // 设置基础目录为当前文件所在目录 (Set the base directory to the current file's directory)
});

// 定义 ESLint 配置数组 (Define the ESLint configuration array)
const eslintConfig = [
  // 扩展 Next.js 核心 Web Vitals 和 TypeScript 相关规则
  // (Extend Next.js core Web Vitals and TypeScript related rules)
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // 添加 eslint-plugin-import 的配置
  // (Add configuration for eslint-plugin-import)
  {
    plugins: {
      import: importPlugin, // 注册 import 插件 (Register the import plugin)
    },
    rules: {
      // import 插件的推荐规则 (Recommended rules for the import plugin)
      'import/order': [
        // 控制导入语句的顺序 (Control the order of import statements)
        'warn', // 将此规则级别设置为警告 (Set this rule level to warning)
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
            // 为特定路径模式定义分组 (Define groups for specific path patterns)
            {
              pattern: '{react,react-dom/**,next,next/**}', // React 和 Next.js 相关模块 (React and Next.js related modules)
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**', // 项目内部的绝对路径别名 (Project internal absolute path aliases)
              group: 'internal',
            },
          ],
          pathGroupsExcludedImportTypes: ['react', 'type'], // 这些类型导入不应用路径分组 (These import types do not apply path grouping)
          'newlines-between': 'always', // 不同组之间总是需要换行 (Always require newlines between different groups)
          alphabetize: {
            // 按字母顺序排列每个组内的导入 (Alphabetize imports within each group)
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-unresolved': 'off', // 关闭对未解析路径的检查，TypeScript 通常会处理 (Turn off check for unresolved paths, TypeScript usually handles this)
      'import/no-duplicates': 'warn', // 禁止重复导入 (Prohibit duplicate imports)
    },
    settings: {
      // 配置 import 插件以识别 TypeScript 文件
      // (Configure the import plugin to recognize TypeScript files)
      'import/resolver': {
        typescript: {
          project: './tsconfig.json', // 指向项目的 tsconfig.json (Point to the project's tsconfig.json)
        },
        node: true,
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'], // 使用 TypeScript 解析器解析 .ts 和 .tsx 文件
        // (Use TypeScript parser for .ts and .tsx files)
      },
    },
  },

  // 扩展 Prettier 规则，确保它覆盖 ESLint 的格式化规则，避免冲突
  // (Extend Prettier rules to ensure it overrides ESLint's formatting rules, avoiding conflicts)
  ...compat.extends('prettier'),

  // 定义忽略的文件和目录 (Define ignored files and directories)
  {
    ignores: ['node_modules/', '.next/', 'out/', 'logs/', 'public/wasm-cal/'], // 添加了对 public/wasm-cal/ 的忽略
  },
];

// 导出 ESLint 配置 (Export the ESLint configuration)
export default eslintConfig;
