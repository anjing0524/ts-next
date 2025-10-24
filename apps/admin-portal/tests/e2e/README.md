# OAuth 2.1 授权码流程 E2E 测试

## 概述

本测试套件提供了完整的 OAuth 2.1 授权码流程（带 PKCE）的端到端测试，包含 **8 个测试套件，25+ 个具体测试用例**。

## 测试覆盖范围

### Suite 1: OAuth 流程启动 (2 个测试)
- ✅ 1.1: 无 token 访问受保护页面应重定向到 OAuth authorize
- ✅ 1.2: middleware 应生成并存储正确的 PKCE 参数

### Suite 2: Login 页面 (4 个测试)
- ✅ 2.1: authorize 无 session_token 时应重定向到 login
- ✅ 2.2: login 页面应正确显示并包含必要的表单元素
- ✅ 2.3: 使用无效凭证登录应失败
- ✅ 2.4: 使用有效凭证登录应成功并设置 session_token

### Suite 3: Consent 页面 (3 个测试)
- ✅ 3.1: 登录后应显示 consent 页面
- ✅ 3.2: 同意授权应返回 authorization_code
- ✅ 3.3: 拒绝授权应返回错误或重定向到错误页面

### Suite 4: Callback 处理 (2 个测试)
- ✅ 4.1: callback 应验证 state 参数防止 CSRF 攻击
- ✅ 4.2: callback 应正确交换授权码为 access_token

### Suite 5: 完整流程 (1 个测试)
- ✅ 5.1: 端到端完整 OAuth 2.1 授权码流程（PKCE）

### Suite 6: Pingora 配置 (2 个测试)
- ✅ 6.1: 所有路由应通过 Pingora (6188) 端口
- ✅ 6.2: Cookie 应通过 Pingora 正确传递

### Suite 7: 安全性 (4 个测试)
- ✅ 7.1: PKCE 参数应符合规范要求
- ✅ 7.2: 无效的 authorization_code 应被拒绝
- ✅ 7.3: state 参数验证应防止 CSRF 攻击
- ✅ 7.4: Token 应包含必要的声明 (claims)

### Suite 8: 边界情况 (3 个测试)
- ✅ 8.1: 重复提交登录表单应正确处理
- ✅ 8.2: 过期的 authorization_code 应被拒绝
- ✅ 8.3: 缺少必需参数的 authorize 请求应被拒绝

## 快速开始

### 方式 1: 自动启动服务
```bash
cd apps/admin-portal
npx playwright test tests/e2e/oauth-client-flow.spec.ts
```

### 方式 2: 手动启动服务（推荐）
```bash
# 终端 1
cd apps/oauth-service-rust && cargo run

# 终端 2
cd apps/admin-portal && pnpm dev

# 终端 3
cd apps/pingora-proxy && cargo run

# 终端 4
cd apps/admin-portal
PLAYWRIGHT_SKIP_SERVER_START=1 npx playwright test tests/e2e/oauth-client-flow.spec.ts
```

## 测试命令

```bash
# 运行所有测试
npx playwright test tests/e2e/oauth-client-flow.spec.ts

# 运行特定 Suite
npx playwright test tests/e2e/oauth-client-flow.spec.ts -g "Suite 1"

# 有头模式
npx playwright test tests/e2e/oauth-client-flow.spec.ts --headed

# 调试模式
npx playwright test tests/e2e/oauth-client-flow.spec.ts --debug

# UI 模式
npx playwright test tests/e2e/oauth-client-flow.spec.ts --ui
```

## 辅助工具函数

位于 `helpers/oauth-helpers.ts`：

- `generateCodeVerifier()` - 生成 PKCE code_verifier
- `generateCodeChallenge()` - 生成 code_challenge
- `validatePKCEParams()` - 验证 PKCE 参数
- `loginAndGetConsent()` - 登录到 consent 页面
- `completeOAuthFlow()` - 完成完整流程并获取 token
- `decodeJWT()` - 解码 JWT token

详见文件内的完整文档。
