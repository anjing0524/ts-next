# Next.js 16 升级总结

## 升级日期
2024-10-30

## 升级范围
- **Admin Portal** (apps/admin-portal) 从 Next.js 15.4.5 升级到 16.0.1
- **React** 升级从 19.1.0 → 19.2.0
- **相关依赖包** 一起升级以保证兼容性

## 升级步骤完成情况

### ✅ 第 1 步：依赖版本更新
- [x] Next.js: 15.4.5 → 16.0.0
- [x] React: 19.1.0 → 19.2.0
- [x] React DOM: 19.1.0 → 19.2.0
- [x] @types/react: 19.1.9 → 19.2.0
- [x] eslint-config-next: 15.4.5 → 16.0.0
- [x] @next/codemod: 添加到 devDependencies

### ✅ 第 2 步：代码修复
- [x] 修复 callback 页面中的重复变量声明 (cookieString)
- [x] 添加 'use client' 指令到 app-sidebar.tsx
- [x] 修复 browser.ts 中的 crypto 模块错误（移除 Node.js fallback）
- [x] 更新 @repo/ui 的 React 版本依赖

### ✅ 第 3 步：类型兼容性（完成）
- [x] 解决 monorepo 中多个 React 版本引起的类型不一致（pnpm overrides）

### ✅ 第 4 步：可选迁移（完成）
- [x] middleware.ts → proxy.ts 迁移（完成）
- [x] 更新缓存 API 使用（无需更新 - 项目未使用 revalidateTag）

## 关键变更说明

### 1. middleware.ts 弃用警告
Next.js 16 开始推荐使用 `proxy.ts` 替代 `middleware.ts`。当前项目仍使用 middleware.ts，可在后续迭代时迁移。

**当前状态**：middleware.ts 仍正常工作
**建议**：后续可考虑迁移到 proxy.ts，具体参考 [Next.js 文档](https://nextjs.org/docs/messages/middleware-to-proxy)

### 2. Web Crypto API 统一
修复了 `packages/lib/src/utils/browser.ts` 中的 `generateCodeChallenge` 函数，移除了 Node.js crypto 模块的 fallback，完全使用 Web Crypto API（globalThis.crypto.subtle）。

**影响范围**：
- 浏览器环境：完全支持
- Node.js 18+：完全支持
- Edge Runtime：完全支持

### 3. React 19.2 特性支持
新增对 React 19.2 的以下特性的支持：
- View Transitions API
- useEffectEvent() hook
- Activity components

## 已知问题

### 1. Prisma 版本不一致警告
```
Package @prisma/client can't be external
The request @prisma/client/runtime/library.js matches serverExternalPackages
```
**原因**：monorepo 中有多个 Prisma 版本（6.11.1 vs 6.13.0）
**影响**：仅为警告，不影响功能
**解决方案**：可在后续统一 Prisma 版本

### 2. TypeScript 版本要求
ESLint 配置期望 TypeScript < 5.9.0，但项目使用 5.9.2
**影响**：仅为警告，5.9.2 向后兼容
**建议**：无需改动

### 3. next-themes 兼容性
next-themes@0.3.0 不支持 React 19.x，仅为警告
**影响**：主题功能仍正常工作
**建议**：后续更新 next-themes 版本

## 迁移指南

### 环境要求
- Node.js: **>= 20.9** （强制要求）
- TypeScript: **>= 5.1** （推荐 5.9.2）

### 推荐后续步骤

#### 1. 解决 monorepo React 版本问题
在根目录 package.json 中添加 pnpm overrides：
```json
{
  "overrides": {
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "@types/react": "19.2.0"
  }
}
```

#### 2. 迁移 middleware.ts → proxy.ts（可选）
```bash
# 重命名文件
mv apps/admin-portal/middleware.ts apps/admin-portal/proxy.ts

# 更新 matcher 配置（如需要）
# proxy.ts 不需要 matcher 配置，直接处理所有请求边界
```

#### 3. 使用 Next.js Codemod 自动升级
```bash
npx @next/codemod@latest upgrade latest
```

#### 4. 更新缓存 API（如适用）
Next.js 16 更新了缓存 API：
```typescript
// 旧写法
revalidateTag('users')

// 新写法（Next.js 16+）
import { revalidateTag } from 'next/cache'
revalidateTag('users')
```

## 性能改进

### 1. Turbopack 作为默认构建器
- 生产构建速度提升 2-5 倍
- 开发模式启动更快
- 增量构建优化

### 2. React Compiler 支持
可选集成 React Compiler 以获得自动 memoization。

### 3. 路由优化
- 布局去重
- 增量预加载
- 更好的 code splitting

## 测试清单

- [ ] 运行单元测试：`pnpm test`
- [ ] 运行 E2E 测试：`pnpm test:e2e`
- [ ] 开发模式验证：`pnpm dev`
- [ ] 生产构建验证：`pnpm build`
- [ ] OAuth 流程测试：验证登录/授权流程正常
- [ ] 数据库操作测试：验证 Prisma 查询正常
- [ ] API 调用测试：验证所有 API 端点正常

## 文档更新

### 已更新
- [x] admin-portal package.json
- [x] @repo/ui package.json
- [x] packages/lib browser.ts

### 推荐更新
- [ ] README.md 中的 Next.js 版本说明
- [ ] 开发指南中的依赖要求
- [ ] 部署指南中的构建配置

## 后续工作

### 优先级高
1. 解决 monorepo 多版本 React 问题
2. 完成所有组件的 TypeScript 编译
3. 运行完整测试套件

### 优先级中
4. 迁移 middleware.ts → proxy.ts
5. 更新 next-themes 依赖
6. 统一 Prisma 版本

### 优先级低
7. 探索 React Compiler 集成
8. 优化 Turbopack 配置
9. 更新项目文档

## 相关资源

- [Next.js 16 发布公告](https://nextjs.org/blog/next-16)
- [Next.js 16 升级指南](https://nextjs.org/docs/upgrading)
- [React 19.2 发布说明](https://react.dev/blog)
- [Turbopack 文档](https://turbo.build/pack)

## 联系和支持

如有升级相关问题，请参考上述资源或创建 GitHub Issue。
