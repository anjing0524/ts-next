# Playwright E2E 测试场景设计

## 测试架构

```
Test Suite
├── 场景1：标准 OAuth 2.1 第三方应用流程
├── 场景2：无有效 Token 的受保护页面访问
├── 场景3：登录流程完整验证
├── 场景4：Token 过期和刷新
├── 场景5：权限验证
├── 场景6：错误处理和边界情况
└── 场景7：安全性验证
```

## 详细测试场景

### 场景 1: 标准 OAuth 2.1 第三方应用流程

**目标**: 验证完整的 OAuth 2.1 授权码流程

**前提条件**:
- 所有服务运行（OAuth Service, Admin Portal, Pingora）
- 测试用户存在：admin/admin123
- Pingora 路由配置正确

**测试步骤**:

```typescript
test('完整的 OAuth 2.1 授权码流程', async ({ page, context }) => {
  // 1. 访问受保护的 Admin Portal 页面
  await page.goto('http://localhost:6188/admin/dashboard');

  // 2. 验证页面 URL：应该被重定向到 OAuth /authorize
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/);
  const authorizeUrl = page.url();

  // 3. 验证 URL 包含必要的 PKCE 参数
  const url = new URL(authorizeUrl);
  expect(url.searchParams.get('client_id')).toBe('admin-portal-client');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('state')).toBeTruthy();
  expect(url.searchParams.get('redirect_uri')).toContain('/auth/callback');

  // 4. 验证重定向到登录页面
  await page.waitForURL(/\/login\?redirect=/);
  const loginUrl = page.url();

  // 5. 验证登录页面加载
  const loginForm = page.locator('form');
  expect(await loginForm.count()).toBe(1);

  // 6. 提交登录凭证
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button:has-text("登录")');

  // 7. 验证重定向回 OAuth /authorize
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/);

  // 8. 验证再次重定向到 callback，带有授权码
  await page.waitForURL(/\/auth\/callback\?code=/);
  const callbackUrl = page.url();
  const code = new URL(callbackUrl).searchParams.get('code');
  expect(code).toBeTruthy();

  // 9. 验证页面处理回调（应该交换 token）
  await page.waitForURL(/\/admin\/dashboard/);

  // 10. 验证 Token 被存储
  const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(accessToken).toBeTruthy();
  expect(accessToken).toMatch(/^ey[\w\-\.]+$/);  // JWT 格式

  // 11. 验证页面内容可见
  const welcomeText = page.locator('h1');
  await expect(welcomeText).toContainText(/Dashboard|仪表盘/);
});
```

### 场景 2: 无有效 Token 的受保护页面访问

**目标**: 验证未认证用户无法直接访问受保护页面

**测试步骤**:

```typescript
test('未认证用户访问受保护页面被重定向', async ({ page }) => {
  // 1. 确保没有任何 token
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => sessionStorage.clear());

  // 2. 直接访问受保护的页面
  await page.goto('http://localhost:6188/admin/users');

  // 3. 应该被重定向到 OAuth /authorize
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/);

  // 4. 然后被重定向到登录页面
  await page.waitForURL(/\/login\?redirect=/);

  // 5. 验证登录页面存在
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();

  // 6. 验证无法跳过登录
  await page.goto('http://localhost:6188/admin/users');
  await page.waitForURL(/\/login\?redirect=/);  // 应该再次重定向
});
```

### 场景 3: 直接访问 /login 页面（应该失败）

**目标**: 验证 /login 页面不能直接被访问

**测试步骤**:

```typescript
test('/login 页面必须通过 OAuth /authorize 重定向到达', async ({ page }) => {
  // 1. 清空所有认证信息
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());

  // 2. 直接访问 /login（没有 redirect 参数）
  await page.goto('http://localhost:6188/login');

  // 3. 应该被拒绝或重定向到首页
  // 选项A：重定向到首页
  const url = page.url();
  expect(url).not.toContain('/login');  // 不应该停留在 /login

  // 4. 尝试访问 /login?redirect=invalid
  await page.goto('http://localhost:6188/login?redirect=invalid');
  // 应该被拒绝

  // 5. 访问 /login?redirect=<valid_oauth_url>
  const validRedirect = encodeURIComponent(
    'http://localhost:6188/api/v2/oauth/authorize?client_id=admin-portal-client&...'
  );
  await page.goto(`http://localhost:6188/login?redirect=${validRedirect}`);
  // 应该显示登录表单
  await expect(page.locator('form')).toBeVisible();
});
```

### 场景 4: Token 过期检测

**目标**: 验证系统能检测 token 过期并自动处理

**测试步骤**:

```typescript
test('Token 过期后自动触发重新认证', async ({ page }) => {
  // 1. 正常登录
  await loginWithCredentials(page, 'admin', 'admin123');
  await page.goto('http://localhost:6188/admin/dashboard');

  // 2. 验证已认证
  let accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(accessToken).toBeTruthy();

  // 3. 模拟 token 过期（修改 expires_at）
  const now = Date.now();
  await page.evaluate(() => {
    localStorage.setItem('token_expires_at', (now - 1000).toString());
  });

  // 4. 刷新页面或进行 API 调用
  await page.reload();

  // 5. 应该被重定向到授权页面
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/, { timeout: 5000 });

  // 6. 或者如果支持自动刷新，应该保持登录状态
  const accessToken2 = await page.evaluate(() => localStorage.getItem('access_token'));
  // 应该被更新或为 null（需要重新登录）
});
```

### 场景 5: 权限验证

**目标**: 验证权限系统正确工作

**测试步骤**:

```typescript
test('权限不足时拒绝访问', async ({ page }) => {
  // 1. 以 viewer 身份登录（只读权限）
  await loginWithCredentials(page, 'viewer', 'viewer123');

  // 2. 尝试访问需要编辑权限的页面
  await page.goto('http://localhost:6188/admin/system/roles');

  // 3. 应该被重定向到 unauthorized 页面
  // 或显示权限不足消息
  await page.waitForURL(/\/unauthorized|\/403/, { timeout: 5000 });

  // 4. 确认错误消息
  const errorText = page.locator('[role="alert"]');
  await expect(errorText).toContainText(/权限|Permission|Forbidden/i);

  // 5. 以 admin 身份登录
  await page.evaluate(() => localStorage.clear());
  await loginWithCredentials(page, 'admin', 'admin123');

  // 6. 再次访问相同页面
  await page.goto('http://localhost:6188/admin/system/roles');

  // 7. 应该能访问
  await expect(page.locator('h1, h2')).toContainText(/Roles|角色/i);
});
```

### 场景 6: PKCE 验证

**目标**: 验证 PKCE 参数正确生成和验证

**测试步骤**:

```typescript
test('PKCE 参数被正确生成和验证', async ({ page }) => {
  // 1. 访问受保护页面
  await page.goto('http://localhost:6188/admin/dashboard');

  // 2. 应该被重定向到 /authorize
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/);

  // 3. 捕获 authorize URL
  const authorizeUrl = new URL(page.url());
  const codeChallenge = authorizeUrl.searchParams.get('code_challenge');
  const state = authorizeUrl.searchParams.get('state');

  // 4. 验证参数格式
  expect(codeChallenge).toBeTruthy();
  expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);  // Base64URL 格式
  expect(codeChallenge.length).toBeGreaterThan(40);   // 至少 43 字符

  expect(state).toBeTruthy();
  expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(state.length).toBeGreaterThanOrEqual(32);

  // 5. 继续登录流程
  await page.waitForURL(/\/login/);
  await loginWithFormSubmit(page);

  // 6. 验证 callback 有授权码
  await page.waitForURL(/\/auth\/callback\?code=/);

  // 7. 验证 token 被交换成功
  const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(accessToken).toBeTruthy();
});
```

### 场景 7: CSRF 防护验证

**目标**: 验证 state 参数防护 CSRF 攻击

**测试步骤**:

```typescript
test('无效的 state 参数被拒绝', async ({ page }) => {
  // 1. 正常开始登录流程
  await page.goto('http://localhost:6188/admin/dashboard');
  await page.waitForURL(/\/api\/v2\/oauth\/authorize/);

  // 2. 从 URL 获取原始 state
  const originalState = new URL(page.url()).searchParams.get('state');

  // 3. 继续登录
  await page.waitForURL(/\/login/);
  await loginWithFormSubmit(page);

  // 4. 应该重定向到 /auth/callback?code=...
  await page.waitForURL(/\/auth\/callback\?code=/);

  // 5. 验证 callback 处理成功
  const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(accessToken).toBeTruthy();

  // 6. 现在测试 CSRF：手动构造无效的 callback
  await page.goto(`http://localhost:6188/auth/callback?code=fake_code&state=invalid_state`);

  // 7. 应该看到错误
  const errorElement = page.locator('[role="alert"], .error, [class*="error"]');
  await expect(errorElement).toContainText(/CSRF|Invalid|无效/i);
});
```

### 场景 8: Cookie 同域验证

**目标**: 验证 OAuth Service 和 Admin Portal 通过 Pingora 共享 Cookie

**测试步骤**:

```typescript
test('Session Token 在同域内被正确共享', async ({ page, context }) => {
  // 1. 登录到 OAuth Service（通过 /login）
  await page.goto('http://localhost:6188/login?redirect=' +
    encodeURIComponent('http://localhost:6188/api/v2/oauth/authorize?...'));

  // 2. 提交登录表单
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button');

  // 3. 检查 session_token cookie
  const cookies = await context.cookies();
  const sessionCookie = cookies.find(c => c.name === 'session_token');

  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie?.domain).toContain('localhost');
  expect(sessionCookie?.path).toBe('/');
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe('Lax');

  // 4. 验证 OAuth /authorize 端点能见到这个 cookie
  // （通过观察是否直接返回授权码而不是重定向到登录）
  await page.waitForURL(/auth\/callback\?code=/);  // 直接跳到 callback
  expect(page.url()).toContain('code=');
});
```

### 场景 9: Consent Screen（可选）

**目标**: 验证用户授权确认流程

**测试步骤**:

```typescript
test('用户授权确认页面', async ({ page }) => {
  // 前提：如果实现了 consent screen

  // 1. 开始 OAuth 流程
  await page.goto('http://localhost:6188/admin/dashboard');

  // 2. 经过登录
  await page.waitForURL(/\/login/);
  await loginWithFormSubmit(page);

  // 3. 应该显示 consent 页面
  await page.waitForURL(/\/oauth\/consent/);

  // 4. 验证页面显示应用名和请求的权限
  await expect(page.locator('h1, h2')).toContainText(/确认|Authorize|同意/i);

  // 5. 点击同意
  await page.click('button:has-text("同意") , button:has-text("Authorize")');

  // 6. 继续到 callback
  await page.waitForURL(/auth\/callback\?code=/);
});
```

## 辅助函数库

```typescript
// helpers/oauth-test-helpers.ts

export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string
) {
  // 访问 OAuth /authorize
  await page.goto('http://localhost:6188/admin/dashboard');

  // 被重定向到 /login
  await page.waitForURL(/\/login/);

  // 提交凭证
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("登录")');

  // 等待回调完成
  await page.waitForURL(/admin\/dashboard/);

  // 验证登录成功
  const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(accessToken).toBeTruthy();

  return accessToken;
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function getStoredTokens(page: Page) {
  return await page.evaluate(() => ({
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
    expiresAt: localStorage.getItem('token_expires_at'),
  }));
}

export async function getCookie(page: Page, context: BrowserContext, name: string) {
  const cookies = await context.cookies();
  return cookies.find(c => c.name === name);
}

export function extractCodeFromURL(url: string): string | null {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('code');
}

export function extractStateFromURL(url: string): string | null {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('state');
}
```

## 测试覆盖率目标

| 场景 | 覆盖率 | 优先级 |
|------|--------|--------|
| OAuth 2.1 标准流程 | 100% | 🔴 必须 |
| 无 token 访问受保护页面 | 100% | 🔴 必须 |
| 直接访问 /login | 100% | 🔴 必须 |
| Token 过期处理 | 80% | 🟡 重要 |
| 权限验证 | 90% | 🟡 重要 |
| PKCE 验证 | 100% | 🔴 必须 |
| CSRF 防护 | 100% | 🔴 必须 |
| Cookie 同域 | 100% | 🔴 必须 |
| Consent 流程 | 50% | 🟢 可选 |

**总目标覆盖率**: 95%+

## 运行策略

1. **单独运行**:
   ```bash
   pnpm --filter=admin-portal test:e2e -- --grep "OAuth 2.1"
   ```

2. **完整运行**:
   ```bash
   pnpm --filter=admin-portal test:e2e
   ```

3. **调试模式**:
   ```bash
   pnpm --filter=admin-portal test:e2e:debug
   ```

4. **UI 模式**:
   ```bash
   pnpm --filter=admin-portal test:e2e:ui
   ```

## 预期测试时间

- 单个测试: 10-30 秒
- 完整套件: 3-5 分钟
- 调试模式: 需要人工交互

## 依赖和前置条件

- 所有服务必须运行：OAuth Service (3001), Admin Portal (3002), Pingora (6188)
- 数据库已初始化，测试用户存在
- Playwright 已安装：`pnpm exec playwright install chromium`
- 所有环境变量已配置

## 失败诊断

| 失败症状 | 可能原因 | 解决方案 |
|---------|---------|---------|
| 无法连接 localhost:6188 | Pingora 未运行 | `cd apps/pingora-proxy && cargo run` |
| 授权码交换失败 | OAuth Service 未运行 | `pnpm --filter=oauth-service dev` |
| Token 格式错误 | JWT 密钥配置 | 检查 JWT_PRIVATE_KEY_PATH |
| Cookie 不共享 | Pingora 路由错误 | 检查 default.yaml 配置 |
| 页面加载超时 | Admin Portal 未运行 | `pnpm --filter=admin-portal dev` |
