# @repo/lib 导出内容清单

> 更新时间：2025-07-17

本文件汇总了 @repo/lib 的所有主要导出内容，涵盖统一入口、Node 端与 Browser 端专用出口，便于开发者统一查阅和规范 import 路径。

---

## 统一入口 (@repo/lib)

### 主要导出

- `LIB_VERSION`：库版本号
- `successResponse`：成功响应工具函数
- `errorResponse`：错误响应工具函数
- `generateRequestId`：请求ID生成工具

### 类型定义

- 统一导出所有类型定义（如 auth-types、RBAC、权限等）

---

## Node.js 服务端专用 (@repo/lib/node)

### 认证相关 (auth)

#### 工具类
- `JWTUtils`：JWT 工具类，包含签名、验证、解析等功能
- `PKCEUtils`：PKCE 工具类，处理代码交换证明密钥
- `ScopeUtils`：Scope 权限工具，处理权限范围验证
- `AuthorizationUtils`：OAuth2 授权工具，处理授权码流程
- `PasswordUtils`：密码工具类（hashPassword、verifyPassword）

#### 工具函数
- `getUserIdFromRequest`：从请求中提取用户ID
- `hashPassword`：密码哈希函数
- `verifyPassword`：密码验证函数

#### 类型定义
- `JWTPayload`：JWT载荷类型
- `JWTOptions`：JWT配置选项
- `TokenValidationResult`：令牌验证结果
- `PKCEChallenge`：PKCE挑战类型
- `ScopeValidationResult`：权限验证结果
- `PasswordHashResult`：密码哈希结果
- `RefreshTokenPayload`：刷新令牌载荷
- `AccessTokenPayload`：访问令牌载荷
- `IdTokenPayload`：身份令牌载荷

### 通用工具 (utils)

#### 工具类
- `RateLimitUtils`：速率限制工具
- `TimeWheel`：时间轮算法实现
- `getTimeWheelInstance`：获取时间轮实例
- `logger`：日志工具

#### 工具函数
- `withErrorHandling`：错误处理高阶函数
- `exclude`：对象属性过滤
- `excludePassword`：排除密码字段

#### 类型定义
- `RateLimitConfig`：速率限制配置
- `RateLimitResult`：速率限制结果
- `TaskOptions`：任务选项

### 服务 (services)

#### 服务类
- `RBACService`：RBAC 权限服务
- `PermissionService`：权限服务
- `UserService`：用户服务

#### 工具函数
- `getUserDetails`：用户信息服务
- `getUserPermissions`：获取用户权限

#### 类型定义
- `UserPermissions`：用户权限类型
- `PermissionCheckResult`：权限检查结果

### 中间件 (middleware)

#### Bearer 认证中间件
- `authenticateBearer`：Bearer 令牌认证
- `AuthContext`：认证上下文
- `AuthOptions`：认证选项

#### CORS 中间件
- `withCORS`：CORS 中间件
- `withDefaultCORS`：默认CORS配置
- `withEnvCORS`：环境变量CORS配置
- `getCORSOptionsFromEnv`：从环境变量获取CORS选项

#### 速率限制中间件
- `withRateLimit`：通用速率限制
- `withOAuthRateLimit`：OAuth专用速率限制
- `withIPRateLimit`：基于IP的速率限制
- `withUserRateLimit`：基于用户的速率限制

#### 请求校验中间件
- `validateRequest`：请求验证
- `validateRedirectUri`：重定向URI验证
- `validatePKCE`：PKCE验证
- `withValidation`：验证包装器

#### 类型定义
- `CORSOptions`：CORS配置选项
- `RateLimitOptions`：速率限制选项
- `ValidationOptions`：验证选项
- `ValidationResult`：验证结果

### 配置 (config)

- `OAuthConfig`：OAuth2 配置管理类
- `DEFAULT_OAUTH_CONFIG`：默认 OAuth2 配置
- `OAuthClientConfig`：客户端配置类型
- `OAuthServiceConfig`：服务配置类型

### 错误处理 (errors)

- 导出所有错误类型与工具函数

---

## 浏览器端专用 (@repo/lib/browser)

### PKCE 工具
- `BrowserPKCEUtils`：浏览器 PKCE 工具

### 类型定义
- 浏览器端专用类型定义

---

## 类型定义 (@repo/lib/types)

### 认证相关类型
- `AuthUser`：认证用户类型
- `AuthToken`：认证令牌类型
- `Permission`：权限类型
- `Role`：角色类型
- `Scope`：作用域类型

### API 相关类型
- `ApiResponse`：API响应类型
- `PaginatedResponse`：分页响应类型
- `ErrorResponse`：错误响应类型

### 菜单相关类型
- `MenuItem`：菜单项类型
- `MenuConfig`：菜单配置类型

---

## 使用说明

### 推荐导入方式

```typescript
// Node.js 服务端
import { JWTUtils, RBACService } from '@repo/lib/node';

// 浏览器端
import { BrowserPKCEUtils } from '@repo/lib/browser';

// 类型定义
import type { AuthUser, ApiResponse } from '@repo/lib/types';

// 统一入口（通用工具）
import { successResponse, errorResponse } from '@repo/lib';
```

### 禁止的导入方式

```typescript
// ❌ 禁止深层路径导入
import { JWTUtils } from '@repo/lib/auth/jwt-utils';
import { RBACService } from '@repo/lib/services/rbac-service';

// ✅ 推荐导入方式
import { JWTUtils, RBACService } from '@repo/lib/node';
```

### 注意事项

1. **Node.js 环境**：请统一使用 `@repo/lib/node` 导入
2. **浏览器环境**：请统一使用 `@repo/lib/browser` 导入
3. **类型定义**：使用 `@repo/lib/types` 导入类型
4. **通用工具**：可直接从 `@repo/lib` 导入
5. **禁止**：禁止深层路径导入，确保代码的可维护性