# Monorepo 依赖关系分析报告

**文档日期：** 2024-12-19

## 项目概述

本项目是一个使用 Turborepo 管理的 monorepo 项目，包含 5 个应用和 9 个共享包。项目使用 Next.js 15、shadcn/ui、Tailwind CSS 4 等现代技术栈。

## 项目结构分析

### 应用 (Apps)

- `admin-portal` - 管理门户 (端口: 3002)
- `oauth-service` - OAuth 认证服务 (端口: 3001)
- `kline-service` - K线图服务 (端口: 3003)
- `flow-service` - 流程服务 (端口: 3004)
- `test-service` - 测试服务 (端口: 3005)

### 共享包 (Packages)

- `@repo/eslint-config` - ESLint 配置
- `@repo/prettier-config` - Prettier 配置
- `@repo/typescript-config` - TypeScript 配置
- `@repo/tailwind-config` - Tailwind CSS 配置
- `@repo/next-config` - Next.js 配置
- `@repo/jest-config` - Jest 测试配置
- `@repo/ui` - UI 组件库
- `@repo/lib` - 工具库
- `@repo/database` - 数据库客户端
- `@repo/cache` - 缓存工具

## 共享配置使用情况分析

### ✅ 正确使用的配置

| 配置包                  | admin-portal | oauth-service | kline-service | flow-service | test-service |
| ----------------------- | ------------ | ------------- | ------------- | ------------ | ------------ |
| @repo/eslint-config     | ✅           | ✅            | ✅            | ✅           | ✅           |
| @repo/prettier-config   | ✅           | ✅            | ✅            | ✅           | ✅           |
| @repo/typescript-config | ✅           | ✅            | ✅            | ✅           | ✅           |

### ❌ 使用不一致的配置

| 配置包                | admin-portal | oauth-service | kline-service | flow-service | test-service |
| --------------------- | ------------ | ------------- | ------------- | ------------ | ------------ |
| @repo/tailwind-config | ✅           | ✅            | ✅            | ❌           | ❌           |
| @repo/next-config     | ❌           | ❌            | ❌            | ✅           | ✅           |
| @repo/jest-config     | ❌           | ❌            | ❌            | ❌           | ❌           |

## 版本一致性问题

### ❌ 发现的版本不一致问题

1. **Tailwind CSS 版本不统一：**

   - 根级别和 @repo/tailwind-config: `^4.1.5`
   - oauth-service 和 kline-service: `^3.4.0`

2. **重复依赖问题：**
   - `@prisma/client` 在根级别和应用级别重复
   - `postcss` 和 `autoprefixer` 在多个应用中重复

## Turbo.json 配置分析

### ✅ 现有配置良好

- 构建管道依赖关系配置正确
- 缓存策略合理
- 数据库相关任务完整

### ❌ 缺失的任务配置

- `format` 任务未在 turbo.json 中定义
- `flatc:generate` 任务（kline-service 特有）未配置
- `e2e` 相关任务配置不完整

## 优化建议

### 1. 统一共享配置使用

**需要修改的应用：**

- `flow-service` 和 `test-service` 需要添加 `@repo/tailwind-config`
- `admin-portal`、`oauth-service`、`kline-service` 需要添加 `@repo/next-config`
- 所有应用需要添加 `@repo/jest-config` 并配置测试

### 2. 解决版本一致性问题

**需要升级的依赖：**

```json
// oauth-service 和 kline-service 需要升级
"tailwindcss": "^4.1.5"
```

**需要移除的重复依赖：**

- 将 `@prisma/client` 统一管理在根级别
- 将 `postcss` 和 `autoprefixer` 移至 @repo/tailwind-config

### 3. 更新 Turbo.json 配置

**需要添加的任务：**

```json
{
  "format": {
    "dependsOn": [],
    "outputs": []
  },
  "flatc:generate": {
    "cache": false,
    "dependsOn": []
  },
  "e2e": {
    "dependsOn": ["build"],
    "outputs": ["test-results/**", "playwright-report/**"]
  }
}
```

## 实施计划

### 阶段 1: 更新 Turbo.json 配置

- 添加缺失的任务定义
- 优化任务依赖关系

### 阶段 2: 统一共享配置

- 更新应用的 package.json 文件
- 确保所有应用使用相同的共享配置

### 阶段 3: 解决版本冲突

- 升级 Tailwind CSS 到统一版本
- 清理重复依赖

### 阶段 4: 验证和测试

- 运行构建测试
- 验证所有应用正常工作
- 更新文档

## 预期收益

1. **提高构建效率：** 统一配置减少重复编译
2. **降低维护成本：** 集中管理配置文件
3. **提升代码质量：** 统一的代码规范和测试标准
4. **减少包体积：** 消除重复依赖
5. **改善开发体验：** 一致的开发环境配置

---

**分析完成时间：** 2024-12-19  
**建议实施优先级：** 高  
**预计完成时间：** 1-2 个工作日
