# 测试配置指南

本文档描述了项目中的测试配置和最佳实践，特别针对 Vitest 单元测试和 Playwright e2e 测试的配置。

## 测试架构概述

我们采用了分层测试策略：

### 1. 单元测试 (Vitest)
- **工具**: Vitest + @testing-library/react
- **目标**: 测试组件逻辑、工具函数、业务逻辑
- **位置**: `__tests__/**/*.test.ts`
- **特点**: 快速、隔离、mock外部依赖

### 2. 端到端测试 (Playwright)
- **工具**: Playwright
- **目标**: 测试完整用户流程、认证流程、API集成
- **位置**: `e2e/**/*.spec.ts`
- **特点**: 真实环境、完整流程、跨浏览器

## Vitest 配置

### 配置文件
- `vitest.config.ts` - 主配置文件
- `vitest.setup.ts` - 全局设置和mock

### 关键配置特性
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      exclude: ['**/*.d.ts', '**/node_modules/**', '**/.next/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
```

### 全局设置 (vitest.setup.ts)
- TextEncoder/TextDecoder polyfills
- Next.js router mock
- next/image mock
- Logger mock
- 测试清理钩子

## 从 Jest 迁移到 Vitest

### API 映射
```typescript
// Jest → Vitest
jest.fn() → vi.fn()
jest.mock() → vi.mock()
jest.useFakeTimers() → vi.useFakeTimers()
jest.advanceTimersByTime() → vi.advanceTimersByTime()
jest.clearAllMocks() → vi.clearAllMocks()
jest.requireActual() → vi.importActual()
```

### Mock 策略变化
```typescript
// 旧的 Jest 方式
import { mockDeep } from 'jest-mock-extended';
jest.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

// 新的 Vitest 方式
vi.mock('@/lib/generated/prisma', () => ({
  PrismaClient: vi.fn(),
}));

const mockPrisma = {
  client: { findUnique: vi.fn() },
  authorizationCode: { create: vi.fn() },
};
vi.mocked(PrismaClient).mockImplementation(() => mockPrisma);
```

## 测试分类策略

### 单元测试适用场景
- ✅ 工具函数 (如 `time-wheel.test.ts`)
- ✅ 组件逻辑测试
- ✅ 业务逻辑验证
- ✅ API 路由的错误处理逻辑
- ✅ 数据转换和验证

### e2e 测试适用场景
- ✅ OAuth 认证流程 (`e2e/oauth-authentication.spec.ts`)
- ✅ 用户注册/登录流程
- ✅ 完整的业务流程
- ✅ 跨页面交互
- ✅ 真实API集成测试

## 运行测试

### 单元测试
```bash
# 运行所有单元测试
npm run test

# 运行单元测试（一次性）
npm run test:unit

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

### e2e 测试
```bash
# 运行所有 e2e 测试
npm run e2e

# 运行 e2e 测试（UI 模式）
npm run e2e:ui

# 查看测试报告
npm run e2e:report

# 特定浏览器测试
npm run test:chrome
npm run test:chrome-78
```

## 测试最佳实践

### 单元测试
1. **隔离性**: 每个测试应该独立运行
2. **Mock 外部依赖**: 数据库、API、文件系统等
3. **测试边界情况**: 错误处理、边界值
4. **描述性测试名**: 清楚描述测试意图

```typescript
// 好的单元测试示例
describe('TimeWheel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test('应该在达到指定的最大执行次数后停止重复任务', () => {
    const timeWheel = new TimeWheel(10, 100);
    const mockCallback = vi.fn();
    
    timeWheel.addTask({
      delay: 100,
      callback: mockCallback,
      repeat: true,
      maxExecutions: 5,
    });

    // 执行测试逻辑...
    expect(mockCallback).toHaveBeenCalledTimes(5);
  });
});
```

### e2e 测试
1. **真实场景**: 模拟真实用户行为
2. **数据清理**: 每个测试前后清理数据
3. **等待策略**: 正确使用 waitFor 等待异步操作
4. **跨浏览器**: 确保在不同浏览器中运行

```typescript
// 好的 e2e 测试示例
test('should complete OAuth authorization code flow', async ({ page }) => {
  // 1. 设置测试数据
  const testClient = { /* ... */ };
  
  // 2. 执行用户操作
  await page.goto(authUrl.toString());
  await page.waitForURL(/\/callback/);
  
  // 3. 验证结果
  expect(currentUrl.searchParams.get('code')).toBeTruthy();
  
  // 4. 继续流程验证
  const tokenResponse = await page.request.post('/api/oauth/token', {
    form: { /* ... */ }
  });
  expect(tokenResponse.status()).toBe(200);
});
```

## 迁移检查清单

### ✅ 已完成
- [x] 安装 Vitest 相关依赖
- [x] 创建 `vitest.config.ts`
- [x] 创建 `vitest.setup.ts`
- [x] 更新 package.json 脚本
- [x] 转换 `time-wheel.test.ts` 到 Vitest
- [x] 转换 OAuth 单元测试到 Vitest
- [x] 创建 OAuth e2e 测试
- [x] 删除 Jest 配置文件

### 🔄 待完成
- [ ] 转换剩余的单元测试文件
- [ ] 创建更多 e2e 测试场景
- [ ] 添加组件测试
- [ ] 设置 CI/CD 集成
- [ ] 性能测试集成

## 故障排除

### 常见问题

1. **Vitest mock 不工作**
   ```typescript
   // 确保在导入前进行 mock
   vi.mock('@/lib/module', () => ({
     default: vi.fn(),
   }));
   ```

2. **Next.js 组件测试失败**
   ```typescript
   // 确保在 vitest.setup.ts 中正确配置了 Next.js mocks
   vi.mock('next/router', () => ({
     useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
   }));
   ```

3. **e2e 测试超时**
   ```typescript
   // 增加超时时间或使用正确的等待策略
   await page.waitForURL(/\/callback/, { timeout: 10000 });
   ```

## 性能优化

### 单元测试
- 使用 `vi.useFakeTimers()` 加速时间相关测试
- 合理使用 `beforeEach` 和 `afterEach` 清理
- 避免不必要的 DOM 操作

### e2e 测试
- 并行运行测试
- 复用浏览器实例
- 合理使用测试数据

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [Playwright 官方文档](https://playwright.dev/)
- [Testing Library 文档](https://testing-library.com/)
- [Next.js 测试指南](https://nextjs.org/docs/testing) 