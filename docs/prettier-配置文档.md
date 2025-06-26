# Prettier 配置文档

## 概述

本文档描述了整个 turborepo 项目的 Prettier 代码格式化配置。所有应用和包都已配置为使用统一的 `@repo/prettier-config` 配置。

## 配置详情

### 共享配置

- **配置包**: `@repo/prettier-config`
- **配置文件**: `/packages/prettier-config/index.js`
- **配置内容**:
  ```javascript
  module.exports = {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    quoteProps: 'as-needed',
    jsxSingleQuote: false,
    trailingComma: 'es5',
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: 'always',
    endOfLine: 'lf',
    embeddedLanguageFormatting: 'auto',
  };
  ```

### 已配置的应用

所有应用都已添加 prettier 配置：

1. **admin-portal** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

2. **flow-service** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `@repo/eslint-config` 依赖（之前缺失）
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

3. **kline-service** ✅

   - 已有 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

4. **oauth-service** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

5. **test-service** ✅
   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `@repo/eslint-config` 依赖（之前缺失）
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

### 已配置的包

核心包都已添加 prettier 配置：

1. **cache** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

2. **database** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

3. **lib** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

4. **ui** ✅

   - 添加了 `@repo/prettier-config` 依赖
   - 添加了 `"prettier": "@repo/prettier-config"` 配置
   - 添加了 `format` 脚本

5. **eslint-config** ✅
   - 添加了 `"prettier": "@repo/prettier-config"` 配置

## ESLint 与 Prettier 集成

### 兼容性配置

- `@repo/eslint-config` 包已包含 `eslint-config-prettier` 依赖
- 在 `flat.js` 中正确配置了 prettier 扩展：
  - Next.js 应用: `extends: ['next/core-web-vitals', 'next/typescript', 'prettier']`
  - 库包: `extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'turbo', 'prettier']`

### Lint-staged 配置

根目录的 `.lintstagedrc.js` 已配置：

```javascript
module.exports = {
  '**/*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  '**/*.{json,css,md,html}': ['prettier --write'],
};
```

## 使用方法

### 格式化命令

- **全项目格式化**: `pnpm format`
- **单个应用格式化**: `pnpm --filter <app-name> format`
- **单个包格式化**: `pnpm --filter <package-name> format`

### 支持的文件类型

- TypeScript: `.ts`, `.tsx`
- JavaScript: `.js`, `.jsx`
- 配置文件: `.json`
- 样式文件: `.css`
- 文档文件: `.md`
- HTML 文件: `.html`

## 验证

配置完成后，运行 `pnpm format` 命令验证了所有文件都能正确格式化。

## 最佳实践

1. **提交前格式化**: 使用 husky 和 lint-staged 在提交前自动格式化代码
2. **编辑器集成**: 建议在 VS Code 中安装 Prettier 扩展并启用保存时格式化
3. **团队协作**: 确保所有团队成员都使用相同的 Prettier 配置
4. **CI/CD 集成**: 在 CI 流程中添加格式化检查

## 故障排除

如果遇到格式化问题：

1. 确认 `@repo/prettier-config` 包已正确安装
2. 检查 package.json 中的 prettier 配置是否正确
3. 运行 `pnpm install` 重新安装依赖
4. 检查文件是否在 `.prettierignore` 中被忽略
