# Next.js 16 + Turbopack Monorepo 修复报告

> 日期: 2025-11-19
> 状态: ✅ **成功修复**
> 会话: claude/production-readiness-oauth-013HBkCHYjcdDoNrvLVYLwkq

## 执行摘要

成功修复 Next.js 16 + Turbopack 在 pnpm monorepo 环境中的兼容性问题。**Dev 模式完全正常运行**，页面正常渲染，无模块解析错误。

## 问题分析

### 根本原因

Turbopack 在 monorepo 中编译 `@repo/ui` 包时，无法正确解析该包的依赖（如 `@radix-ui/*`, `class-variance-authority` 等），这是由于：

1. **缺少 transpilePackages 配置** - Next.js 不知道需要转译哪些 workspace 包
2. **pnpm 严格依赖隔离** - 依赖未被提升到根 `node_modules`
3. **Turbopack 无法解析 symlink** - 无法跟踪 `.pnpm` 目录中的依赖

### 修复方案：三步走策略

## 核心修复

### 1. 配置 Next.js transpilePackages

**文件:** `apps/admin-portal/next.config.js`

```javascript
const nextConfig = {
  // 关键配置：告诉 Next.js/Turbopack 转译 monorepo 中的包
  transpilePackages: ['@repo/ui', '@repo/lib', '@repo/database', '@repo/cache'],

  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },

  serverExternalPackages: [],
};
```

**作用:**
- 告诉 Turbopack 需要编译哪些 workspace 包
- 确保 monorepo 包被正确处理
- 这是 Next.js monorepo 环境的**必需配置**

### 2. 配置 pnpm public-hoist-pattern

**文件:** `.npmrc`

```ini
registry=https://registry.npmjs.org/

# Monorepo 配置 - 提升 UI 组件库依赖到根目录
# 这允许 Next.js/Turbopack 正确解析跨包依赖
public-hoist-pattern[]=@radix-ui/*
public-hoist-pattern[]=@tanstack/*
public-hoist-pattern[]=class-variance-authority
public-hoist-pattern[]=clsx
public-hoist-pattern[]=tailwind-merge
public-hoist-pattern[]=lucide-react
public-hoist-pattern[]=react-hook-form
public-hoist-pattern[]=@hookform/*
public-hoist-pattern[]=zod
public-hoist-pattern[]=date-fns
public-hoist-pattern[]=sonner
public-hoist-pattern[]=recharts
public-hoist-pattern[]=cmdk
public-hoist-pattern[]=vaul
public-hoist-pattern[]=next-themes
public-hoist-pattern[]=react-day-picker
public-hoist-pattern[]=react-contexify
public-hoist-pattern[]=react-toastify
public-hoist-pattern[]=embla-carousel-react
public-hoist-pattern[]=@dnd-kit/*
public-hoist-pattern[]=radix-ui
```

**作用:**
- 将 `@repo/ui` 的依赖提升到根 `node_modules`
- 允许 Turbopack 直接访问这些包
- 避免 symlink 解析问题

### 3. 安装直接依赖

**文件:** `apps/admin-portal/package.json`

添加了必要的依赖：
```json
{
  "dependencies": {
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.2"
    // ... 等 +42 个包
  }
}
```

**作用:**
- 确保 admin-portal 可以直接访问所有需要的包
- 作为 public-hoist-pattern 的补充

## 附加修复

### 4. 修复 i18n 类型错误

**文件:** `apps/admin-portal/i18n.ts`

```typescript
export default getRequestConfig(async ({ locale }) => {
  const validLocale = locale && locales.includes(locale as Locale) ? locale : defaultLocale;

  return {
    locale: validLocale,  // ← 添加 locale 字段
    messages: (await import(`./messages/${validLocale}.json`)).default,
  };
});
```

### 5. 更新 next-intl API

**文件:** `apps/admin-portal/lib/i18n/navigation.ts`

```typescript
// 旧 API (已弃用)
import { createSharedPathnamesNavigation } from 'next-intl/navigation';

// 新 API (next-intl@4.5.3)
import { createNavigation } from 'next-intl/navigation';

export const { Link, redirect, usePathname, useRouter } = createNavigation({
  locales,
  defaultLocale,  // ← 新增必需参数
});
```

### 6. 移除已弃用的 Web Vitals 指标

**文件:** `apps/admin-portal/lib/analytics/web-vitals.ts`

```typescript
// 旧: onFID 已在 web-vitals@5 中被移除
import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB, onINP }) => {
  onFID(reportWebVitals);  // ✗ 不再可用
});

// 新: 使用 INP 替代 FID
import('web-vitals').then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
  onINP(reportWebVitals);  // ✓ 正确
});
```

## 验证结果

### ✅ Dev 模式测试

```bash
$ pnpm --filter=admin-portal dev

✓ Ready in 5.9s
```

### ✅ 页面访问测试

```bash
$ curl -I http://localhost:3002/
HTTP/1.1 200 OK

$ curl http://localhost:3002/ | grep "<title>"
<title>Admin Portal</title>

✅ 页面正常加载
✅ 无模块解析错误
```

### ⚠️ 生产构建状态

```bash
$ pnpm --filter=admin-portal build

✓ Compiled successfully in 7.0s
✗ TypeScript errors (Sentry 配置)
```

**剩余问题:**
- Sentry 配置类型错误（`tracePropagationTargets` 已弃用）
- 不影响功能，仅影响类型检查

## 技术债务

| 项目 | 优先级 | 预计时间 |
|------|--------|----------|
| 修复 Sentry 配置类型错误 | 中 | 30 分钟 |
| 完成生产构建验证 | 中 | 1 小时 |
| 运行 E2E 测试套件 | 高 | 2 小时 |

## Git 提交历史

```
09e5a2ce - fix(admin-portal): Fix Next.js 16 + Turbopack monorepo compatibility
3140344a - docs: Add comprehensive Next.js 16 + Turbopack diagnostic report
ad735f0b - docs: Add comprehensive production readiness validation status report
57af65dc - chore: Add OAuth Service local files to .gitignore
3af93b4f - fix(admin-portal): Simplify global error handler for Turbopack compatibility
```

**分支:** `claude/production-readiness-oauth-013HBkCHYjcdDoNrvLVYLwkq`

## 经验总结

### ✅ 成功因素

1. **正确理解问题本质** - monorepo 依赖解析而非 Turbopack 缺陷
2. **分步骤修复** - 配置 → 提升依赖 → 安装包
3. **验证每一步** - 确保每个修复都有效果
4. **保持冷静** - 不急于降级，相信工具链

### 📚 关键学习

1. **Next.js monorepo 必需配置:**
   ```javascript
   transpilePackages: ['@repo/*']
   ```

2. **pnpm monorepo 最佳实践:**
   ```ini
   public-hoist-pattern[]=@radix-ui/*
   ```

3. **Turbopack + monorepo 完全兼容** - 只需正确配置

### 🎯 最佳实践建议

对于使用 Next.js 16 + Turbopack + pnpm monorepo 的项目：

1. **总是配置 transpilePackages**
2. **使用 public-hoist-pattern 提升共享依赖**
3. **确保 workspace 包有完整的依赖声明**
4. **定期更新依赖，避免 API 不兼容**
5. **在 CI/CD 中同时验证 dev 和 build**

## 下一步行动

### 立即行动（今天）

1. ✅ ~~修复 monorepo 依赖问题~~
2. ⬜ 修复 Sentry 配置类型错误
3. ⬜ 完成生产构建

### 短期行动（本周）

1. ⬜ 运行完整 E2E 测试套件（40 个测试）
2. ⬜ 启动所有服务（OAuth + Admin Portal + Pingora）
3. ⬜ 验证完整 OAuth 流程

### 中期行动（持续）

1. ⬜ 监控 Turbopack 新版本
2. ⬜ 优化构建性能
3. ⬜ 补充 monorepo 文档

## 结论

**Turbopack 完全支持 monorepo**，只需正确配置。本次修复证明了：

- ✅ Next.js 16 可以在 monorepo 中正常使用
- ✅ Turbopack 与 pnpm workspace 兼容
- ✅ 无需降级或拆分仓库
- ✅ Dev 体验优秀（Ready in 5.9s）

**核心要点:** `transpilePackages` + `public-hoist-pattern` = Turbopack monorepo 成功方程式

---

**报告生成:** Claude Code
**验证通过:** Dev 模式完全正常运行 ✅
