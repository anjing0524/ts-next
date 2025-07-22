# Admin Portal E2E 测试

这个目录包含了 Admin Portal 应用的端到端（E2E）测试，使用 Playwright 测试框架。

## 📁 目录结构

```
tests/e2e/
├── pages/                    # 页面对象模式 (POM)
│   ├── base-page.ts         # 基础页面类
│   ├── login-page.ts        # 登录页面
│   ├── dashboard-page.ts    # 仪表盘页面
│   ├── user-management-page.ts    # 用户管理页面
│   ├── role-management-page.ts    # 角色管理页面
│   ├── client-management-page.ts  # 客户端管理页面
│   └── profile-page.ts      # 个人资料页面
├── specs/                   # 测试用例
│   ├── auth.spec.ts         # 认证测试
│   ├── dashboard.spec.ts    # 仪表盘测试
│   ├── user-management.spec.ts    # 用户管理测试
│   ├── role-management.spec.ts    # 角色管理测试
│   ├── client-management.spec.ts  # 客户端管理测试
│   ├── profile-management.spec.ts # 个人资料测试
│   └── oauth-flow.spec.ts   # OAuth 流程测试
├── utils/                   # 测试工具
│   └── test-helpers.ts      # 测试辅助函数
├── global-setup.ts          # 全局设置
├── global-teardown.ts       # 全局清理
└── README.md               # 本文件
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装 Playwright 浏览器
pnpm run playwright:install
```

### 2. 启动服务

确保以下服务正在运行：
- OAuth Service (端口 3001)
- Admin Portal (端口 3002)

```bash
# 在项目根目录启动所有服务
pnpm dev
```

### 3. 运行测试

```bash
# 运行所有 E2E 测试
pnpm run test:e2e

# 使用 UI 模式运行测试
pnpm run test:e2e:ui

# 有头模式运行测试（显示浏览器）
pnpm run test:e2e:headed

# 调试模式运行测试
pnpm run test:e2e:debug

# 查看测试报告
pnpm run test:e2e:report

# CI 模式运行测试
pnpm run test:e2e:ci
```

## 📋 测试用例覆盖

### 认证测试 (auth.spec.ts)
- ✅ 用户登录/登出
- ✅ 双因素认证 (2FA)
- ✅ 密码错误处理
- ✅ 账户锁定
- ✅ 会话管理
- ✅ 令牌刷新

### 仪表盘测试 (dashboard.spec.ts)
- ✅ 数据展示
- ✅ 权限验证
- ✅ 导航功能
- ✅ 实时更新
- ✅ 响应式设计

### 用户管理测试 (user-management.spec.ts)
- ✅ 用户列表显示
- ✅ 用户搜索和筛选
- ✅ 创建/编辑/删除用户
- ✅ 批量操作
- ✅ 状态管理
- ✅ 权限控制

### 角色管理测试 (role-management.spec.ts)
- ✅ 角色列表显示
- ✅ 角色搜索和筛选
- ✅ 创建/编辑/删除角色
- ✅ 权限分配
- ✅ 内置角色保护
- ✅ 角色使用情况验证

### 客户端管理测试 (client-management.spec.ts)
- ✅ 客户端列表显示
- ✅ 客户端搜索和筛选
- ✅ 创建/编辑/删除客户端
- ✅ 密钥管理
- ✅ OAuth 配置
- ✅ PKCE 验证

### 个人资料测试 (profile-management.spec.ts)
- ✅ 个人信息显示
- ✅ 信息更新
- ✅ 密码修改
- ✅ 头像上传
- ✅ 双因素认证设置
- ✅ API 密钥管理

### OAuth 流程测试 (oauth-flow.spec.ts)
- ✅ 授权码流程
- ✅ PKCE 验证
- ✅ 令牌交换
- ✅ 错误处理
- ✅ 安全验证

## 🛠️ 测试工具

### 页面对象模式 (POM)

每个页面都有对应的页面对象类，封装了页面元素和操作方法：

```typescript
// 示例：使用登录页面对象
const loginPage = new LoginPage(page);
await loginPage.navigate();
await loginPage.login('admin@test.com', 'admin123');
```

### 测试辅助工具

`TestHelpers` 类提供了常用的测试辅助方法：

```typescript
// 生成测试数据
const userData = TestHelpers.generateUserData();

// 模拟 API 响应
await TestHelpers.mockApiResponse(page, '/api/users', userData);

// 等待元素动画完成
await TestHelpers.waitForAnimation(page, '.modal');
```

## 🔧 配置

### Playwright 配置

测试配置在 `playwright.config.ts` 中定义：

- **并行执行**: 提高测试速度
- **重试机制**: 处理偶发性失败
- **截图和视频**: 失败时自动保存
- **多浏览器**: 支持 Chrome、Firefox、Safari
- **移动端**: 支持移动设备模拟

### 环境变量

测试使用以下环境变量：

```bash
NODE_ENV=test
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3002
DATABASE_URL=file:./test.db
JWT_SECRET=test-jwt-secret-key-for-e2e-testing
ENCRYPTION_KEY=test-encryption-key-32-chars-long
```

## 📊 测试报告

测试完成后，可以查看详细的测试报告：

```bash
# 查看 HTML 报告
pnpm run test:e2e:report

# 查看 JSON 报告
cat test-results.json
```

报告包含：
- 测试结果统计
- 失败测试的截图和视频
- 性能指标
- 覆盖率信息

## 🐛 调试

### 调试失败的测试

```bash
# 调试模式运行特定测试
pnpm run test:e2e:debug -- auth.spec.ts

# 有头模式运行测试
pnpm run test:e2e:headed -- auth.spec.ts
```

### 查看测试痕迹

```bash
# 启用痕迹记录
pnpm run test:e2e -- --trace on

# 查看痕迹
pnpm exec playwright show-trace test-results/trace.zip
```

## 📝 编写新测试

### 1. 创建页面对象

```typescript
// pages/new-page.ts
import { BasePage } from './base-page';

export class NewPage extends BasePage {
  async navigate() {
    await this.page.goto('/new-page');
  }
  
  async clickButton() {
    await this.page.click('[data-testid="new-button"]');
  }
}
```

### 2. 编写测试用例

```typescript
// specs/new-feature.spec.ts
import { test, expect } from '@playwright/test';
import { NewPage } from '../pages/new-page';

test.describe('新功能测试', () => {
  test('应该能够执行新操作', async ({ page }) => {
    const newPage = new NewPage(page);
    await newPage.navigate();
    await newPage.clickButton();
    
    await expect(page.locator('.success-message')).toBeVisible();
  });
});
```

## 🔒 最佳实践

### 1. 测试隔离
- 每个测试都应该是独立的
- 使用 `test.beforeEach` 进行测试前置设置
- 使用 `test.afterEach` 进行测试后清理

### 2. 数据管理
- 使用测试专用的数据
- 避免依赖外部数据
- 测试后清理数据

### 3. 等待策略
- 使用 `page.waitForSelector` 等待元素
- 避免使用 `page.waitForTimeout`
- 使用 `expect` 的自动重试机制

### 4. 选择器策略
- 优先使用 `data-testid` 属性
- 避免使用 CSS 类名或 ID
- 使用语义化的选择器

### 5. 错误处理
- 验证错误消息
- 测试边界条件
- 模拟网络错误

## 🚨 故障排除

### 常见问题

1. **服务未启动**
   ```bash
   Error: connect ECONNREFUSED 127.0.0.1:3001
   ```
   解决：确保 OAuth Service 和 Admin Portal 都在运行

2. **浏览器未安装**
   ```bash
   Error: Executable doesn't exist at /path/to/chromium
   ```
   解决：运行 `pnpm run playwright:install`

3. **测试超时**
   ```bash
   Error: Test timeout of 30000ms exceeded
   ```
   解决：检查网络连接，增加超时时间

4. **元素未找到**
   ```bash
   Error: Locator not found
   ```
   解决：检查选择器，确保元素存在

### 获取帮助

- 查看 [Playwright 文档](https://playwright.dev/)
- 检查测试日志和截图
- 使用调试模式运行测试
- 联系开发团队

## 📈 持续集成

在 CI/CD 流水线中运行 E2E 测试：

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e:ci
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

**注意**: 这些测试需要完整的应用环境，包括数据库和所有依赖服务。确保在运行测试前正确设置环境。