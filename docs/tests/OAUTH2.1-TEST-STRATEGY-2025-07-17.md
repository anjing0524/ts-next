# OAuth 2.1 + OIDC 测试策略文档

> **文档版本**: v1.0.0  
> **创建日期**: 2025-07-17  
> **维护团队**: 测试团队  
> **测试范围**: admin-portal OAuth客户端 + 认证中心UI完整测试

## 1. 测试架构概览

基于admin-portal的双重角色设计测试策略：
- **OAuth客户端测试**: 验证PKCE流程、令牌管理、权限解析
- **认证中心UI测试**: 验证登录页面、授权同意页面、错误处理
- **端到端集成测试**: 完整OAuth 2.1 + OIDC流程验证

## 2. 测试分层架构

```
┌─────────────────────────────────────┐
│           E2E测试层                  │
│  (完整用户认证流程)                   │
├─────────────────────────────────────┤
│         集成测试层                   │
│  (OAuth API + 前端集成)               │
├─────────────────────────────────────┤
│         单元测试层                   │
│  (组件 + Hook + 工具函数)             │
├─────────────────────────────────────┤
│         安全测试层                   │
│  (PKCE + JWT + 权限验证)              │
└─────────────────────────────────────┘
```

## 3. 核心测试场景

### 3.1 首次认证流程测试

**完整用户旅程测试**:
1. 用户首次访问 `https://admin-portal.example.com/admin`
2. 检测到无有效token，重定向到 `https://oauth-service.example.com/api/v2/oauth/authorize`
3. 携带参数验证:
   - `client_id=admin-portal`
   - `response_type=code`
   - `scope=openid profile admin:read admin:write`
   - `code_challenge_method=S256`
   - `code_challenge` 长度43-128字符
4. oauth-service检测到未认证，重定向到 `https://admin-portal.example.com/auth/login`
5. 用户输入用户名密码登录
6. 登录成功后重定向到 `https://admin-portal.example.com/oauth/consent`
7. 显示admin-portal请求的权限详情
8. 用户点击"授权"后完成令牌交换
9. 最终重定向回原始 `/admin` 页面

### 3.2 令牌管理测试

#### 3.2.1 令牌生命周期测试

| 测试场景 | 期望值 | 验证点 |
|---------|--------|--------|
| access_token过期前5分钟 | 自动刷新令牌 | 用户无感知 |
| refresh_token过期 | 触发重新登录 | 重定向到登录页 |
| 令牌撤销 | 立即失效 | 重定向到登录页 |
| 密钥轮换 | JWT验证通过 | JWKS自动更新 |

#### 3.2.2 PKCE验证测试

```typescript
// 测试PKCE参数生成
const pkceTest = {
  codeVerifier: generateCodeVerifier(), // 长度43-128
  codeChallenge: generateCodeChallenge(codeVerifier), // S256哈希
  codeChallengeMethod: 'S256' // 强制要求
}

// 测试PKCE验证流程
expect(verifyPKCE(codeVerifier, codeChallenge)).toBe(true)
expect(verifyPKCE('invalid', codeChallenge)).toBe(false)
```

### 3.3 权限验证测试

#### 3.3.1 JWT权限解析测试

**测试JWT结构**:
```json
{
  "iss": "oauth-service",
  "sub": "user-123",
  "aud": "admin-portal",
  "exp": 1234567890,
  "iat": 1234567890,
  "scope": "openid profile admin:read admin:write",
  "permissions": ["user:list", "client:read", "role:update"],
  "user": {
    "id": "user-123",
    "username": "admin",
    "displayName": "系统管理员"
  }
}
```

#### 3.3.2 权限边界测试

| 用户角色 | 应有权限 | 禁止权限 | 测试用例 |
|----------|----------|----------|----------|
| SYSTEM_ADMIN | *.* | 无 | 可访问所有功能 |
| USER_ADMIN | user:*, role:list | role:update | 只能管理用户 |
| USER | dashboard:view, profile:* | user:* | 只能查看个人信息 |

## 4. 测试数据配置

### 4.1 测试环境

```bash
# 测试环境变量
TEST_OAUTH_CLIENT_ID=admin-portal
TEST_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
TEST_OAUTH_AUTHORITY=http://localhost:3001
TEST_JWKS_URL=http://localhost:3001/.well-known/jwks.json
```

### 4.2 测试用户

```typescript
// 测试用户数据
const testUsers = {
  admin: {
    username: 'test_admin',
    password: 'Test@Admin123',
    permissions: ['*.*'],
    roles: ['SYSTEM_ADMIN'],
    expectedScopes: ['openid', 'profile', 'admin:read', 'admin:write']
  },
  userAdmin: {
    username: 'test_useradmin',
    password: 'Test@UserAdmin123',
    permissions: ['user:*', 'role:list', 'client:list'],
    roles: ['USER_ADMIN'],
    expectedScopes: ['openid', 'profile', 'user:read', 'user:write']
  },
  normalUser: {
    username: 'test_user',
    password: 'Test@User123',
    permissions: ['dashboard:view', 'profile:read', 'profile:update'],
    roles: ['USER'],
    expectedScopes: ['openid', 'profile']
  }
}
```

### 4.3 测试OAuth客户端

```typescript
// admin-portal测试客户端配置
const adminPortalClient = {
  client_id: 'admin-portal',
  client_secret: 'test_secret_12345',
  redirect_uris: [
    'http://localhost:3000/auth/callback',
    'https://admin-portal.example.com/auth/callback'
  ],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid profile admin:read admin:write user:read user:write',
  token_endpoint_auth_method: 'client_secret_post',
  require_pkce: true
}
```

## 5. 自动化测试实现

### 5.1 E2E测试用例

#### 5.1.1 完整认证流程测试

```typescript
// Playwright E2E测试
test.describe('OAuth 2.1 Complete Flow', () => {
  test('首次登录完整流程', async ({ page }) => {
    // 1. 访问受保护页面
    await page.goto('/admin/users')
    
    // 2. 验证重定向到授权端点
    await expect(page).toHaveURL(/\/oauth\/authorize\?client_id=admin-portal/)
    
    // 3. 验证PKCE参数存在
    const url = new URL(page.url())
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43,128}$/)
    
    // 4. 重定向到登录页面
    await page.waitForURL('/auth/login?**')
    
    // 5. 执行登录
    await page.fill('[data-testid="username-input"]', 'test_admin')
    await page.fill('[data-testid="password-input"]', 'Test@Admin123')
    await page.click('[data-testid="login-button"]')
    
    // 6. 授权同意页面
    await page.waitForURL('/oauth/consent?**')
    await expect(page.locator('[data-testid="client-info"]')).toContainText('admin-portal')
    await page.click('[data-testid="consent-allow"]')
    
    // 7. 验证最终重定向
    await page.waitForURL('/admin/users')
    
    // 8. 验证本地存储中的令牌
    const tokens = await page.evaluate(() => {
      return {
        access: localStorage.getItem('access_token'),
        refresh: localStorage.getItem('refresh_token')
      }
    })
    expect(tokens.access).toBeTruthy()
    expect(tokens.refresh).toBeTruthy()
  })
})
```

#### 5.1.2 令牌刷新测试

```typescript
test('令牌自动刷新', async ({ page }) => {
  // 登录并获取初始令牌
  await loginWithTestUser(page, 'test_admin')
  
  // 获取初始令牌信息
  const initialToken = await getAccessToken(page)
  
  // 模拟令牌过期（通过修改本地存储中的过期时间）
  await page.evaluate(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]))
      payload.exp = Math.floor(Date.now() / 1000) - 60 // 设置为1分钟前过期
      const newToken = token.split('.')[0] + '.' + btoa(JSON.stringify(payload)) + '.' + token.split('.')[2]
      localStorage.setItem('access_token', newToken)
    }
  })
  
  // 触发API调用，应该自动刷新令牌
  await page.reload()
  
  // 验证令牌已更新
  const newToken = await getAccessToken(page)
  expect(newToken).not.toBe(initialToken)
  
  // 验证用户仍保持登录状态
  await expect(page.locator('[data-testid="user-menu"]')).toContainText('test_admin')
})
```

### 5.2 集成测试

#### 5.2.1 OAuth端点测试

```typescript
describe('OAuth API Integration', () => {
  test('/oauth/authorize端点参数验证', async () => {
    const response = await fetch('/api/v2/oauth/authorize?' + new URLSearchParams({
      client_id: 'admin-portal',
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: 'http://localhost:3000/auth/callback',
      state: 'test_state_123',
      code_challenge: 'test_code_challenge_123456789012345678901234567890',
      code_challenge_method: 'S256'
    }))
    
    expect(response.status).toBe(302) // 重定向到登录
    expect(response.headers.get('location')).toContain('/auth/login')
  })
  
  test('/oauth/token令牌交换', async () => {
    const response = await fetch('/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'admin-portal',
        client_secret: 'test_secret_12345',
        code: 'test_authorization_code',
        redirect_uri: 'http://localhost:3000/auth/callback',
        code_verifier: 'test_code_verifier_123456789012345678901234567890'
      })
    })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('access_token')
    expect(data).toHaveProperty('refresh_token')
    expect(data).toHaveProperty('id_token')
    expect(data.token_type).toBe('Bearer')
    expect(data.expires_in).toBe(900) // 15分钟
  })
})
```

### 5.3 安全测试

#### 5.3.1 PKCE安全测试

```typescript
describe('PKCE Security Tests', () => {
  test('缺失code_challenge应返回错误', async () => {
    const response = await fetch('/api/v2/oauth/authorize?' + new URLSearchParams({
      client_id: 'admin-portal',
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: 'http://localhost:3000/auth/callback'
    }))
    
    expect(response.status).toBe(400)
    const error = await response.json()
    expect(error.error).toBe('invalid_request')
    expect(error.error_description).toContain('code_challenge')
  })
  
  test('无效的code_challenge_method应返回错误', async () => {
    const response = await fetch('/api/v2/oauth/authorize?' + new URLSearchParams({
      client_id: 'admin-portal',
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: 'http://localhost:3000/auth/callback',
      code_challenge: 'invalid_challenge',
      code_challenge_method: 'plain' // 应使用S256
    }))
    
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toContain('error=invalid_request')
  })
})
```

#### 5.3.2 JWT签名验证测试

```typescript
describe('JWT Security Tests', () => {
  test('JWT签名验证', async () => {
    const token = await getValidAccessToken()
    const [header, payload, signature] = token.split('.')
    
    // 验证JWT结构
    expect(header).toBeTruthy()
    expect(payload).toBeTruthy()
    expect(signature).toBeTruthy()
    
    // 验证签名算法
    const headerObj = JSON.parse(atob(header))
    expect(headerObj.alg).toBe('RS256')
    
    // 验证必要字段
    const payloadObj = JSON.parse(atob(payload))
    expect(payloadObj).toHaveProperty('iss', 'oauth-service')
    expect(payloadObj).toHaveProperty('aud', 'admin-portal')
    expect(payloadObj).toHaveProperty('exp')
    expect(payloadObj).toHaveProperty('iat')
    expect(payloadObj).toHaveProperty('scope')
    expect(payloadObj).toHaveProperty('permissions')
  })
})
```

## 6. 性能测试

### 6.1 性能基准

| 测试场景 | 目标性能 | 测试方法 |
|----------|----------|----------|
| 首次登录流程 | < 2秒 | Playwright计时 |
| 令牌刷新 | < 200ms | 自动化测试测量 |
| 权限验证 | < 50ms | 前端性能监控 |
| 页面加载（已认证） | < 1秒 | Lighthouse测试 |

### 6.2 压力测试

```typescript
// 并发登录测试
test.describe('Concurrent Login Stress Test', () => {
  test('100个并发用户登录', async ({ browser }) => {
    const contexts = await Promise.all(
      Array(100).fill(null).map(() => browser.newContext())
    )
    
    const loginPromises = contexts.map(async (context) => {
      const page = await context.newPage()
      return loginWithTestUser(page, 'test_admin')
    })
    
    const results = await Promise.allSettled(loginPromises)
    const successCount = results.filter(r => r.status === 'fulfilled').length
    
    expect(successCount).toBeGreaterThan(95) // 95%成功率
  })
})
```

## 7. 测试环境配置

### 7.1 测试环境隔离

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  oauth-service-test:
    image: oauth-service:latest
    environment:
      - NODE_ENV=test
      - JWT_SECRET=test_jwt_secret_12345
      - DATABASE_URL=postgresql://test:test@postgres-test:5432/oauth_test
    ports:
      - "3001:3000"
  
  postgres-test:
    image: postgres:15
    environment:
      - POSTGRES_DB=oauth_test
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
```

### 7.2 测试命令

```bash
# 运行所有测试
pnpm test:oauth

# 运行特定测试套件
pnpm test:e2e:oauth
pnpm test:integration:oauth  
pnpm test:security:oauth

# 生成测试报告
pnpm test:report
pnpm test:coverage
```

## 8. 监控与告警

### 8.1 测试监控指标

- **认证成功率**: >99%
- **令牌刷新成功率**: >99.9%
- **测试用例通过率**: 100%
- **性能回归**: 性能下降>10%时告警

### 8.2 持续集成

```yaml
# .github/workflows/oauth-tests.yml
name: OAuth 2.1 Tests
on: [push, pull_request]

jobs:
  oauth-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Setup test environment
        run: docker-compose -f docker-compose.test.yml up -d
      - name: Run OAuth tests
        run: pnpm test:oauth --reporter=html
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: oauth-test-results
          path: test-results/
```