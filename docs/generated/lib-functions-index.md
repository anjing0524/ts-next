# @repo/lib 导出内容清单

> 更新时间：2025-07-10

本文件汇总了 @repo/lib 的所有主要导出内容，涵盖 Node 端与 Browser 端唯一出口，便于开发者统一查阅和规范 import 路径。

---

## Node 端唯一出口（@repo/lib/node）

### 认证相关（auth）

- `JWTUtils`：JWT 工具类
- `PKCEUtils`：PKCE 工具类
- `ScopeUtils`：Scope 权限工具
- `AuthorizationUtils`：OAuth2 授权工具
- `getUserIdFromRequest`：从请求中提取用户ID
- 密码工具函数：全部导出（如 hashPassword、verifyPassword 等）
- 类型：
  - `JWTPayload`、`JWTOptions`、`TokenValidationResult`、`PKCEChallenge`、`ScopeValidationResult`、`PasswordHashResult`
  - `RefreshTokenPayload`、`AccessTokenPayload`、`IdTokenPayload`

### 通用工具（utils）

- `RateLimitUtils`：速率限制工具
- `withErrorHandling`：错误处理高阶函数
- `TimeWheel`、`getTimeWheelInstance`：时间轮算法
- `logger`：日志工具
- `exclude`、`excludePassword`：对象属性过滤
- 类型：`RateLimitConfig`、`RateLimitResult`、`TaskOptions`

### 服务（services）

- `RBACService`：RBAC 权限服务
- `PermissionService`：权限服务
- `getUserDetails`：用户信息服务
- 类型：`UserPermissions`、`PermissionCheckResult`

### 中间件（middleware）

- `authenticateBearer`、`AuthContext`、`AuthOptions`：Bearer 认证中间件
- `withCORS`、`withDefaultCORS`、`withEnvCORS`、`getCORSOptionsFromEnv`、`CORSOptions`：CORS 中间件
- `withRateLimit`、`withOAuthRateLimit`、`withIPRateLimit`、`withUserRateLimit`、`RateLimitOptions`：速率限制中间件
- `validateRequest`、`validateRedirectUri`、`validatePKCE`、`withValidation`、`ValidationOptions`、`ValidationResult`：请求校验中间件

### 配置（config）

- `OAuthConfig`：OAuth2 配置管理类
- `DEFAULT_OAUTH_CONFIG`：默认 OAuth2 配置
- 类型：`OAuthClientConfig`、`OAuthServiceConfig`

### 其他

- `successResponse`、`errorResponse`、`generateRequestId`：API 响应工具
- `@repo/cache`、`@repo/database`：缓存与数据库服务
- `errors`：全部错误类型与工具
- `types`：全部类型定义
- `LIB_VERSION`：库版本号

---

## Browser 端唯一出口（@repo/lib/browser）

- `BrowserPKCEUtils`：浏览器 PKCE 工具
- 类型定义（部分）
- `LIB_VERSION`：库版本号

---

## 类型定义（@repo/lib/types）

- 统一导出所有类型（如 auth-types、RBAC、权限等）

---

## 说明

- Node 端请统一使用 `@repo/lib/node` 导入，Browser 端请统一使用 `@repo/lib/browser` 导入。
- 禁止深层路径 import（如 `@repo/lib/auth/xxx`），如需类型可用 `@repo/lib/types`。
- 如需补充导出，请在 `node/index.ts` 或 `browser/index.ts` 维护。
