# E2E测试策略 - OAuth2.1集成验证

**文档版本**: v2.0.0  
**创建日期**: 2025-07-16  
**最后更新**: 2025-07-16  
**关联文档**: [OAuth2.1集成分析与完整计划](../OAUTH2.1_INTEGRATION_ANALYSIS_AND_PLAN.md)

## 1. 测试目标

本测试策略旨在验证admin-portal与oauth-service的完整OAuth2.1集成，确保：

- 标准OAuth2.1授权码+PKCE流程正确实现
- 权限控制机制有效运行
- 用户体验流畅一致
- 安全要求得到满足

## 2. 测试环境配置

### 2.1 测试环境要求

```bash
# 测试环境变量
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_ADMIN_PORTAL_URL=http://localhost:3000
TEST_USER_USERNAME=test_admin
TEST_USER_PASSWORD=test_password
TEST_CLIENT_ID=admin-portal-client
```

### 2.2 测试数据准备

```sql
-- 测试用户
INSERT INTO users (id, username, email, password_hash, is_active) VALUES
('test-user-1', 'test_admin', 'admin@test.com', '$2b$12$...', true);

-- 测试角色
INSERT INTO roles (id, name, description) VALUES
('admin-role', '系统管理员', '拥有所有系统权限');

-- 测试权限
INSERT INTO permissions (id, name, description) VALUES
('dashboard:view', '查看仪表盘', '允许访问管理仪表盘'),
('user:list', '用户列表', '查看用户列表'),
('user:create', '创建用户', '创建新用户'),
('client:list', '客户端列表', '查看OAuth客户端列表'),
('system:config', '系统配置', '管理系统配置');

-- 角色权限关联
INSERT INTO role_permissions (role_id, permission_id) VALUES
('admin-role', 'dashboard:view'),
('admin-role', 'user:list'),
('admin-role', 'user:create'),
('admin-role', 'client:list'),
('admin-role', 'system:config');

-- 用户角色关联
INSERT INTO user_roles (user_id, role_id) VALUES
('test-user-1', 'admin-role');
```

## 3. 核心测试场景

### 3.1 场景1：完整OAuth2.1登录流程

#### 3.1.1 测试用例：首次访问重定向

```typescript
// test/e2e/auth-flow.spec.ts
test('未登录用户访问管理页面应重定向到登录', async ({ page }) => {
  await page.goto('/admin/users');

  // 验证重定向到登录页
  await expect(page).toHaveURL(/.*\/login/);

  // 验证登录页面元素
  await expect(page.locator('h1')).toContainText('管理员登录');
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});
```

#### 3.1.2 测试用例：PKCE参数验证

```typescript
test('登录流程应正确生成PKCE参数', async ({ page }) => {
  await page.goto('/login');

  // 监听网络请求
  const authorizeRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/oauth/authorize') &&
      request.url().includes('code_challenge=') &&
      request.url().includes('code_challenge_method=S256')
  );

  // 填写并提交登录表单
  await page.fill('input[name="username"]', 'test_admin');
  await page.fill('input[name="password"]', 'test_password');
  await page.click('button[type="submit"]');

  // 验证PKCE参数存在
  const request = await authorizeRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('state')).toBeTruthy();
});
```

#### 3.1.3 测试用例：授权确认页面

```typescript
test('用户应看到授权确认页面', async ({ page }) => {
  await page.goto('/login');

  // 登录
  await page.fill('input[name="username"]', 'test_admin');
  await page.fill('input[name="password"]', 'test_password');
  await page.click('button[type="submit"]');

  // 等待授权确认页面
  await expect(page).toHaveURL(/.*\/oauth\/consent/);
  await expect(page.locator('h1')).toContainText('授权应用');
  await expect(page.locator('text=admin-portal-client')).toBeVisible();
});
```

#### 3.1.4 测试用例：成功登录重定向

```typescript
test('成功登录后应重定向到原目标页面', async ({ page }) => {
  // 先访问目标页面
  await page.goto('/admin/users');

  // 登录流程
  await page.fill('input[name="username"]', 'test_admin');
  await page.fill('input[name="password"]', 'test_password');
  await page.click('button[type="submit"]');

  // 授权确认
  await page.click('button:has-text("允许")');

  // 验证重定向到原页面
  await expect(page).toHaveURL(/.*\/admin\/users/);
  await expect(page.locator('h1')).toContainText('用户管理');
});
```

### 3.2 场景2：权限控制验证

#### 3.2.1 测试用例：权限不足访问

```typescript
// 创建权限受限用户
test('权限不足用户应看到未授权页面', async ({ page }) => {
  // 创建只有user:read权限的用户
  const limitedUser = await createTestUser(['user:read']);

  await page.goto('/admin/system/config');
  await loginAsUser(page, limitedUser.username, 'password');

  // 验证重定向到未授权页面
  await expect(page).toHaveURL(/.*\/unauthorized/);
  await expect(page.locator('h1')).toContainText('权限不足');
});
```

#### 3.2.2 测试用例：权限边界测试

```typescript
test('用户只能访问有权限的页面', async ({ page }) => {
  const testCases = [
    { permission: 'user:list', path: '/admin/users', shouldAccess: true },
    { permission: 'client:list', path: '/admin/system/clients', shouldAccess: true },
    { permission: 'system:config', path: '/admin/system/config', shouldAccess: false },
  ];

  for (const testCase of testCases) {
    const user = await createTestUser([testCase.permission]);
    await page.goto(testCase.path);
    await loginAsUser(page, user.username, 'password');

    if (testCase.shouldAccess) {
      await expect(page).not.toHaveURL(/.*\/unauthorized/);
    } else {
      await expect(page).toHaveURL(/.*\/unauthorized/);
    }
  }
});
```

### 3.3 场景3：Token生命周期管理

#### 3.3.1 测试用例：Token过期处理

```typescript
test('Token过期应自动重定向到登录', async ({ page, context }) => {
  // 正常登录
  await page.goto('/admin/users');
  await loginAsUser(page, 'test_admin', 'test_password');
  await page.click('button:has-text("允许")');

  // 等待登录成功
  await expect(page).toHaveURL(/.*\/admin\/users/);

  // 模拟token过期 - 清除cookie
  await context.clearCookies();

  // 刷新页面
  await page.reload();

  // 验证重定向到登录
  await expect(page).toHaveURL(/.*\/login/);
});
```

#### 3.3.2 测试用例：Token刷新机制

```typescript
test('应自动刷新过期token', async ({ page }) => {
  // 登录并获取token
  await page.goto('/admin/users');
  await loginAsUser(page, 'test_admin', 'test_password');
  await page.click('button:has-text("允许")');

  // 获取初始token
  const initialToken = await getAuthToken(page);

  // 等待接近过期时间
  await page.waitForTimeout(3500000); // 接近1小时

  // 执行需要权限的操作
  await page.goto('/admin/users');

  // 验证操作成功，token已刷新
  await expect(page).toHaveURL(/.*\/admin\/users/);
  const newToken = await getAuthToken(page);
  expect(newToken).not.toBe(initialToken);
});
```

### 3.4 场景4：错误处理验证

#### 3.4.1 测试用例：无效凭据

```typescript
test('无效用户名密码应显示错误', async ({ page }) => {
  await page.goto('/login');

  await page.fill('input[name="username"]', 'invalid_user');
  await page.fill('input[name="password"]', 'wrong_password');
  await page.click('button[type="submit"]');

  await expect(page.locator('.alert-error')).toContainText('登录失败');
  await expect(page).toHaveURL(/.*\/login/);
});
```

#### 3.4.2 测试用例：授权拒绝

```typescript
test('用户拒绝授权应返回错误', async ({ page }) => {
  await page.goto('/login');

  await page.fill('input[name="username"]', 'test_admin');
  await page.fill('input[name="password"]', 'test_password');
  await page.click('button[type="submit"]');

  // 在授权页面点击拒绝
  await page.click('button:has-text("拒绝访问")');

  // 验证返回错误
  await expect(page.locator('.alert-error')).toContainText('授权被拒绝');
});
```

## 4. 性能测试场景

### 4.1 并发登录测试

```typescript
test('应支持100并发用户登录', async ({ browser }) => {
  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(
      (async () => {
        const page = await browser.newPage();
        const start = Date.now();

        await page.goto('/login');
        await loginAsUser(page, `user${i}`, 'password');
        await page.click('button:has-text("允许")');

        await expect(page).toHaveURL(/.*\/admin/);

        const duration = Date.now() - start;
        return duration;
      })()
    );
  }

  const results = await Promise.all(promises);
  const avgDuration = results.reduce((a, b) => a + b) / results.length;

  expect(avgDuration).toBeLessThan(3000); // 平均3秒内
});
```

### 4.2 权限检查性能

```typescript
test('权限检查应在100ms内完成', async ({ page }) => {
  await loginAsUser(page, 'test_admin', 'test_password');

  const start = Date.now();
  await page.goto('/admin/users');
  await expect(page.locator('h1')).toContainText('用户管理');
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(100);
});
```

## 5. 安全测试场景

### 5.1 CSRF保护测试

```typescript
test('应验证state参数防止CSRF', async ({ page }) => {
  // 尝试使用伪造的state参数
  await page.goto('/oauth/authorize?state=fake_state&...');

  // 验证系统拒绝无效state
  await expect(page.locator('.alert-error')).toContainText('无效的state参数');
});
```

### 5.2 XSS防护测试

```typescript
test('应防止XSS攻击', async ({ page }) => {
  await page.goto('/login');

  // 尝试注入恶意脚本
  await page.fill('input[name="username"]', '<script>alert("xss")</script>');
  await page.click('button[type="submit"]');

  // 验证脚本未执行
  const alerts = page.locator('.alert-error');
  await expect(alerts).not.toContainText('<script>');
});
```

## 6. 测试数据管理

### 6.1 测试用户创建

```typescript
// test/helpers/test-data.ts
export async function createTestUser(permissions: string[]) {
  const userId = `test-user-${Date.now()}`;
  const roleId = `test-role-${Date.now()}`;

  // 创建角色和权限
  await db.role.create({
    data: {
      id: roleId,
      name: `Test Role ${Date.now()}`,
      permissions: {
        create: permissions.map((p) => ({
          permission: { connect: { name: p } },
        })),
      },
    },
  });

  // 创建用户
  const user = await db.user.create({
    data: {
      id: userId,
      username: `test_${Date.now()}`,
      email: `test_${Date.now()}@test.com`,
      password: await bcrypt.hash('password', 12),
      roles: { connect: { id: roleId } },
    },
  });

  return user;
}
```

### 6.2 测试清理

```typescript
afterEach(async () => {
  // 清理测试数据
  await db.user.deleteMany({ where: { username: { startsWith: 'test_' } } });
  await db.role.deleteMany({ where: { name: { startsWith: 'Test Role' } } });
});
```

## 7. 测试执行计划

### 7.1 测试阶段划分

| 阶段  | 测试类型 | 用例数量 | 预计时间 |
| ----- | -------- | -------- | -------- |
| 阶段1 | 功能测试 | 15个     | 4小时    |
| 阶段2 | 权限测试 | 10个     | 3小时    |
| 阶段3 | 性能测试 | 5个      | 2小时    |
| 阶段4 | 安全测试 | 8个      | 3小时    |
| 阶段5 | 集成测试 | 12个     | 4小时    |

### 7.2 测试环境

#### 7.2.1 本地测试

```bash
# 启动测试环境
npm run dev:oauth-service
npm run dev:admin-portal

# 运行测试
npm run test:e2e
```

#### 7.2.2 CI/CD测试

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e
```

## 8. 测试报告模板

### 8.1 测试执行报告

```markdown
## 测试执行报告 - 2025-07-16

### 执行概况

- **测试用例总数**: 50
- **通过**: 48
- **失败**: 2
- **跳过**: 0
- **通过率**: 96%

### 失败用例

1. 权限边界测试 - 系统配置页面权限检查失败
2. 并发登录测试 - 第87个用户登录超时

### 性能指标

- 平均登录时间: 2.3秒
- 权限检查平均时间: 85ms
- 并发用户支持: 95/100

### 建议

1. 优化系统配置页面权限检查逻辑
2. 增加登录超时处理
```

## 9. 测试工具配置

### 9.1 Playwright配置

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

### 9.2 测试辅助函数

```typescript
// tests/helpers/auth-helpers.ts
export async function loginAsUser(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // 等待授权页面
  await page.waitForURL(/.*\/oauth\/consent/);
  await page.click('button:has-text("允许")');

  // 等待登录完成
  await page.waitForURL(/.*\/admin/);
}

export async function getAuthToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === 'access_token');
  return authCookie?.value || '';
}
```

## 10. 测试验收标准

### 10.1 功能验收

- [ ] 所有核心测试用例通过
- [ ] 边界情况测试覆盖100%
- [ ] 错误处理测试完整
- [ ] 权限控制验证通过（中间件静态映射方式）

### 10.2 性能验收

- [ ] 登录流程 < 3秒
- [ ] 权限检查 < 100ms
- [ ] 并发测试通过
- [ ] 内存使用正常

### 10.3 安全验收

- [ ] 安全测试用例通过
- [ ] 无安全漏洞
- [ ] 审计日志完整
- [ ] 敏感信息保护

---

**测试执行**: 请按照测试计划逐步执行，每日更新测试进度和发现的问题。
