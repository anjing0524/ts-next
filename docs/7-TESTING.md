# OAuth 2.1 系统 - 测试文档

**文档版本**: 1.0
**最后更新**: 2025-11-20
**目标受众**: QA、开发、测试工程师

---

## 1. 测试策略

### 测试金字塔

```
        /\
       /  \        E2E Tests (10%)
      /    \       端到端测试
     /______\
      /    \      Integration Tests (30%)
     /      \     集成测试
    /________\
    /          \  Unit Tests (60%)
   /            \ 单元测试
  /______________\
```

### 测试覆盖率目标

| 类型 | 目标 | 工具 |
|------|------|------|
| 单元测试 | > 80% | Jest, cargo test |
| 集成测试 | > 70% | pytest, Rust integration |
| E2E 测试 | > 60% | Playwright, Postman |
| **整体覆盖率** | **> 75%** | SonarQube |

---

## 2. 单元测试

### Rust 单元测试 (OAuth Service)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_pkce_challenge() {
        let code_verifier = "test_code_verifier_string";
        let code_challenge = compute_challenge(code_verifier);

        assert!(verify_pkce(code_verifier, &code_challenge).is_ok());
        assert!(verify_pkce("wrong_verifier", &code_challenge).is_err());
    }

    #[test]
    fn test_password_hashing() {
        let password = "SecurePassword123!";
        let hash = bcrypt::hash(password, 12).unwrap();

        assert!(bcrypt::verify(password, &hash).unwrap());
        assert!(!bcrypt::verify("WrongPassword", &hash).unwrap());
    }

    #[tokio::test]
    async fn test_token_generation() {
        let token_service = create_test_service().await;

        let result = token_service.issue_tokens(
            "user-id",
            "client-id",
            "openid profile",
        ).await;

        assert!(result.is_ok());
        let tokens = result.unwrap();
        assert!(!tokens.access_token.is_empty());
        assert!(!tokens.refresh_token.is_empty());
    }
}
```

运行测试:
```bash
cd apps/oauth-service-rust
cargo test
cargo test --lib  # 仅库代码
cargo test -- --nocapture  # 显示输出
```

### TypeScript 单元测试 (Admin Portal)

```typescript
// auth.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useAuth } from '@/lib/auth/use-auth';

describe('useAuth', () => {
  it('should load user on mount', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      // 等待异步加载
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.user).toBeDefined();
    expect(result.current.loading).toBe(false);
  });

  it('should refresh token when expired', async () => {
    // 测试 token 刷新逻辑
  });
});
```

运行测试:
```bash
cd apps/admin-portal
pnpm test
pnpm test --coverage  # 生成覆盖率报告
```

---

## 3. 集成测试

### API 集成测试

```bash
# 使用 curl 测试完整流程
#!/bin/bash

# 1. 登录获取 session_token
LOGIN_RESPONSE=$(curl -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

SESSION_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.session_token')

# 2. 调用授权端点
AUTH_RESPONSE=$(curl -H "Cookie: session_token=$SESSION_TOKEN" \
  "http://localhost:6188/api/v2/oauth/authorize?client_id=admin-portal-client&...")

# 3. 验证响应
if [ $? -eq 0 ]; then
  echo "✓ Integration test passed"
else
  echo "✗ Integration test failed"
fi
```

### Postman 集成测试

```json
{
  "info": {
    "name": "OAuth 2.1 Integration Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/v2/auth/login",
        "body": {
          "username": "admin",
          "password": "admin123"
        }
      },
      "tests": [
        "pm.test('Status is 200', () => {",
        "  pm.response.to.have.status(200);",
        "});",
        "pm.environment.set('session_token', pm.response.json().session_token);"
      ]
    }
  ]
}
```

---

## 4. E2E 测试 (Playwright)

### 安装和运行

```bash
cd apps/admin-portal

# 安装 Playwright
pnpm add -D @playwright/test

# 运行测试
pnpm exec playwright test

# 交互模式 (调试)
pnpm exec playwright test --debug

# 生成报告
pnpm exec playwright test --reporter=html
```

### E2E 测试示例 (OAuth 2.1 去中心化流程)

```typescript
// tests/oauth-flow.spec.ts
import { test, expect } from '@playwright/test';

/**
 * 完整 OAuth 2.1 流程测试 (OAuth Service 中心化认证)
 *
 * 测试流程:
 * 1. User 访问 Admin Portal (无 token)
 * 2. Admin Portal 生成 PKCE 参数并重定向到 OAuth Service
 * 3. OAuth Service 显示登录页面 (NOT Admin Portal)
 * 4. User 在 OAuth Service 上输入凭证
 * 5. OAuth Service 返回授权码
 * 6. Admin Portal 使用授权码交换 token
 * 7. Admin Portal 加载 Dashboard
 */
test('complete oauth 2.1 login flow with PKCE', async ({ page }) => {
  // 1. Admin Portal 首次加载 (无 token)
  //    注意: Admin Portal 检查 localStorage/sessionStorage 中的 token
  await page.goto('http://localhost:6188/');

  // 2. Admin Portal 应该生成 PKCE 参数并重定向到 OAuth Service
  //    等待重定向到 OAuth Service 的授权端点
  await page.waitForURL('**/api/v2/oauth/authorize**', { timeout: 5000 });

  // 3. OAuth Service 检查 session_token (不存在 -> 重定向到登录页)
  //    等待重定向到 OAuth Service 的登录页
  await page.waitForURL('**/login**', { timeout: 5000 });

  // 4. 验证: 当前页面应该来自 OAuth Service (不是 Admin Portal)
  const loginPageUrl = page.url();
  expect(loginPageUrl).toContain('/login');
  expect(loginPageUrl).toContain('localhost:6188');  // 通过 Pingora 代理

  // 5. 在登录表单中输入凭证 (仅在 OAuth Service 页面)
  //    注意: Admin Portal 完全不参与此过程
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');

  // 6. 点击登录按钮
  await page.click('button[type="submit"]');

  // 7. OAuth Service 验证凭证并返回授权码
  //    应该重定向回 Admin Portal 的 callback 端点
  await page.waitForURL('**/auth/callback**', { timeout: 5000 });

  // 8. Admin Portal 处理 callback:
  //    - 验证 state 参数 (CSRF 保护)
  //    - 使用 code_verifier 和 code 交换 token
  //    - 存储 access_token 和 refresh_token

  // 9. 等待重定向到 Dashboard
  await page.waitForURL('**/dashboard**', { timeout: 5000 });

  // 10. 验证: 用户已登录
  const userMenu = page.locator('[data-testid="user-menu"]');
  await expect(userMenu).toContainText('admin');

  // 11. 验证: access_token 已存储
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(token).toBeDefined();
  expect(token).not.toBeNull();
});

/**
 * 测试: PKCE 验证失败时拒绝访问
 *
 * 验证 Admin Portal 无法伪造授权码
 */
test('PKCE verification prevents code interception', async ({ page }) => {
  // 1. 获取正常的授权流程中的授权码
  const authCode = await getValidAuthCode(page);

  // 2. 尝试用错误的 code_verifier 交换 token
  const response = await page.request.post('http://localhost:6188/api/v2/oauth/token', {
    data: {
      grant_type: 'authorization_code',
      code: authCode,
      code_verifier: 'wrong_verifier_string',  // 错误的验证器
      client_id: 'admin-portal-client',
      client_secret: '<secret>'
    }
  });

  // 3. 应该返回 400 错误 (PKCE 验证失败)
  expect(response.status()).toBe(400);
  const errorBody = await response.json();
  expect(errorBody.error).toContain('PKCE');
});

/**
 * 测试: Token 刷新流程
 */
test('token refresh with refresh_token rotation', async ({ page }) => {
  // 1. 首先完成 OAuth 登录
  await completeOAuthLogin(page, 'admin', 'admin123');

  // 2. 获取当前的 refresh_token
  const oldRefreshToken = await page.evaluate(() =>
    sessionStorage.getItem('refresh_token')
  );

  // 3. 模拟 access_token 过期 (更改过期时间)
  await page.evaluate(() => {
    const claims = JSON.parse(atob(localStorage.getItem('access_token').split('.')[1]));
    localStorage.setItem('token_expires_at', String(Date.now() / 1000));  // 已过期
  });

  // 4. 调用 API (应该触发 token 刷新)
  const response = await page.request.get('http://localhost:6188/api/v2/admin/users', {
    headers: {
      'Authorization': 'Bearer ' + (await getAccessToken(page))
    }
  });

  // 5. 应该返回 200 (token 已自动刷新)
  expect(response.status()).toBe(200);

  // 6. 验证: refresh_token 已轮换 (生成了新的)
  const newRefreshToken = await page.evaluate(() =>
    sessionStorage.getItem('refresh_token')
  );
  expect(newRefreshToken).toBeDefined();
  expect(newRefreshToken).not.toEqual(oldRefreshToken);  // 已轮换
});

/**
 * 测试: 权限拒绝
 */
test('permission denied without required role', async ({ page }) => {
  // 1. 以 'viewer' 角色登录
  await completeOAuthLogin(page, 'viewer_user', 'password123');

  // 2. 访问需要 'users:delete' 权限的端点
  const response = await page.request.delete('http://localhost:6188/api/v2/admin/users/some-id', {
    headers: {
      'Authorization': 'Bearer ' + (await getAccessToken(page))
    }
  });

  // 3. 应该返回 403 (权限不足)
  expect(response.status()).toBe(403);
  const errorBody = await response.json();
  expect(errorBody.error).toContain('Missing required permissions');
});

/**
 * 测试: 登出 (token 撤销)
 */
test('logout revokes tokens', async ({ page }) => {
  // 1. 完成 OAuth 登录
  const token = await completeOAuthLogin(page, 'admin', 'admin123');

  // 2. 验证 token 有效
  const beforeLogout = await page.request.get('http://localhost:6188/api/v2/admin/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  expect(beforeLogout.status()).toBe(200);

  // 3. 执行登出 (调用 /api/auth/logout)
  await page.locator('[data-testid="logout-button"]').click();
  await page.waitForURL('**/login**');  // 重定向到 OAuth Service 登录页

  // 4. 验证: 本地存储的 token 已删除
  const storedToken = await page.evaluate(() => localStorage.getItem('access_token'));
  expect(storedToken).toBeNull();

  // 5. 验证: 使用旧 token 调用 API 返回 401
  const afterLogout = await page.request.get('http://localhost:6188/api/v2/admin/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  expect(afterLogout.status()).toBe(401);
});

// ==================== 辅助函数 ====================

/**
 * 完成完整的 OAuth 登录流程
 */
async function completeOAuthLogin(page, username: string, password: string) {
  await page.goto('http://localhost:6188/');

  // 等待重定向到 OAuth Service 登录页
  await page.waitForURL('**/login**', { timeout: 5000 });

  // 输入凭证
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // 等待 callback 处理完成
  await page.waitForURL('**/dashboard**', { timeout: 5000 });

  // 返回 access_token
  return await getAccessToken(page);
}

/**
 * 获取当前 access_token
 */
async function getAccessToken(page): Promise<string> {
  return await page.evaluate(() => localStorage.getItem('access_token'));
}

/**
 * 获取有效的授权码 (用于测试)
 */
async function getValidAuthCode(page): Promise<string> {
  // 1. 启动 OAuth 流程但在 callback 处拦截授权码
  await page.goto('http://localhost:6188/');
  await page.waitForURL('**/login**', { timeout: 5000 });

  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin123');

  // 在 callback 处拦截
  let capturedCode = '';
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/auth/callback')) {
      const code = new URL(url).searchParams.get('code');
      if (code) capturedCode = code;
    }
  });

  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  return capturedCode;
}
```

---

## 5. 性能测试

### 使用 Locust 进行负载测试

```python
# locustfile.py
from locust import HttpUser, task, between

class OAuthUser(HttpUser):
    wait_time = between(1, 3)

    @task(1)
    def login(self):
        self.client.post("/api/v2/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })

    @task(3)
    def get_users(self):
        self.client.get("/api/v2/admin/users")

    @task(2)
    def get_roles(self):
        self.client.get("/api/v2/admin/roles")
```

运行负载测试:
```bash
# 启动 Locust
locust -f locustfile.py

# 访问 http://localhost:8089
# 设置并发用户数和产生率
# 观察响应时间和错误率
```

### 预期性能指标

| 指标 | 目标 |
|------|------|
| 登录端点 p95 | < 200ms |
| 获取用户列表 p95 | < 100ms |
| Token 刷新 p95 | < 150ms |
| 权限检查 p95 | < 20ms |
| 错误率 | < 0.5% |

---

## 6. 安全测试

### OWASP Top 10 检查

```
[ ] A01: Broken Access Control
    - 检查权限边界
    - 验证 RBAC 实现

[ ] A02: Cryptographic Failures
    - 检查密码哈希强度
    - 检查 JWT 签名
    - 检查 HTTPS 强制

[ ] A03: Injection
    - SQL 注入测试 (SQLx 参数化查询)
    - LDAP 注入测试

[ ] A04: Insecure Design
    - 检查 PKCE 强制
    - 检查 State 参数

[ ] A05: Security Misconfiguration
    - 检查默认凭证
    - 检查暴露的端点

[ ] A06: Vulnerable Components
    - cargo audit
    - npm audit

[ ] A07: Authentication Failures
    - 尝试绕过 MFA
    - 检查会话管理

[ ] A08: Data Integrity Failures
    - 检查授权码单次使用
    - 检查 Token 签名

[ ] A09: Logging Failures
    - 检查敏感数据是否被日志记录
    - 检查审计日志

[ ] A10: SSRF
    - redirect_uri 白名单检查
```

---

## 7. 测试检查清单

### 上线前检查

- [ ] 所有单元测试通过 (cargo test, pnpm test)
- [ ] 代码覆盖率 > 75%
- [ ] 没有关键 SonarQube 问题
- [ ] 没有依赖漏洞 (cargo audit, npm audit)
- [ ] E2E 测试覆盖主流程
- [ ] 性能测试通过 (p95 < 100ms)
- [ ] 安全测试通过 (OWASP Top 10)
- [ ] 部署测试通过 (Docker, K8s)
- [ ] 文档已更新

---

**文档完成日期**: 2025-11-20
**下一次审查**: 2026-02-20
