# @repo/lib 包索引文档

## 概述

本包提供项目中所有共享的工具类、服务和中间件。

## 模块结构

### 🔐 认证模块 (Auth Module)

**导入路径**: `@repo/lib/auth` 或 `@repo/lib`

#### AuthorizationUtils

- **位置**: `src/auth/authorization-utils.ts`
- **作用**: OAuth2 授权相关工具函数
- **主要方法**:
  - `validateRedirectUri()` - 验证重定向URI
  - `validateResponseType()` - 验证响应类型
  - `generateAuthorizationCode()` - 生成授权码
  - `logAuditEvent()` - 记录审计事件
  - `getUserPermissions()` - 获取用户权限

#### JWTUtils

- **位置**: `src/auth/jwt-utils.ts`
- **作用**: JWT 令牌处理工具
- **主要方法**:
  - `generateToken()` - 生成JWT令牌
  - `verifyToken()` - 验证JWT令牌
  - `refreshToken()` - 刷新令牌

#### PKCEUtils

- **位置**: `src/auth/pkce-utils.ts`
- **作用**: PKCE (Proof Key for Code Exchange) 工具
- **主要方法**:
  - `generateCodeChallenge()` - 生成代码挑战
  - `validateCodeChallenge()` - 验证代码挑战

#### ScopeUtils

- **位置**: `src/auth/scope-utils.ts`
- **作用**: OAuth2 范围管理工具
- **主要方法**:
  - `parseScopes()` - 解析范围
  - `validateScopes()` - 验证范围

#### PasswordUtils

- **位置**: `src/auth/password-utils.ts`
- **作用**: 密码处理工具
- **��要方法**:
  - `hashPassword()` - 密码哈希
  - `verifyPassword()` - 密码验证

### 🛡️ 安全最佳实践 (Security Best Practices)

本部分概述了项目中实现的关键安全功能和最佳实践。

#### 密码安全 (Password Security)

- **位置**: `src/auth/password-utils.ts`
- **描述**: 提供强大的密码处理功能，遵循行业标准。
- **主要功能**:
  - `PasswordComplexitySchema`: 使用 `zod` 定义和强制执行密码复杂度规则（长度、字符类别）。
  - `generateSecurePassword()`: 生成符合复杂度要求的加密安全密码。
  - `checkPasswordHistory()`: 防止密码重用，检查新密码是否在近期使用过。
  - `SALT_ROUNDS`: 使用 `bcrypt` 并配置适当的盐轮数（10）来哈希密码，有效抵抗暴力破解。

#### 密钥管理与JWT验证 (Key Management & JWT Validation)

- **JWT客户端验证器**:
  - **位置**: `src/auth/jwt-client-verifier.ts`
  - **描述**: 提供一个客户端安全的JWT验证器，通过JWKS (JSON Web Key Set) URL 动态获取公钥，用于验证令牌签名。
  - **主要方法**: `createVerifier()` - 创建一个可重用的验证器实例。
- **密钥服务**:
  - **位置**: `src/services/key-service.ts`
  - **描述**: 负责生成和管理用于JWT签名的RSA密钥对。在生产环境中，这些密钥���通过安全的方式（如环境变量或密钥管理器）提供。
  - **主要方法**: `getKeyPair()` - 获取公钥和私钥。

#### 速率限制 (Rate Limiting)

- **位置**: `src/middleware/rate-limit.ts`
- **描述**: 提供灵活的速率限制中间件，以防止暴力攻击和资源滥用。
- **主要功能**:
  - 支持基于IP、客户端ID或用户ID的速率限制。
  - `withRateLimit()`: 一个高阶函数，可轻松为任何API路由添加速率限制。
  - `withOAuthRateLimit()`, `withIPRateLimit()`, `withUserRateLimit()`: 为常见场景提供的预配置速率限制器。

#### 分布式追踪 (Distributed Tracing)

- **位置**: `src/utils/tracing.ts`
- **描述**: 支持分布式系统的可观测性，通过生成和传播追踪ID来关联跨服务的请求。
- **主要功能**:
  - `generateTraceId()`: 生成符合B3传播规范的追踪ID。
  - `getTraceHeaders()`: 创建用于HTTP请求的追踪头部。
  - `extractTraceId()`: 从传入请求中提取追踪ID。

### 🛠️ 工具模块 (Utils Module)

**导入路径**: `@repo/lib/utils` 或 `@repo/lib`

#### RateLimitUtils

- **位置**: `src/utils/rate-limit-utils.ts`
- **作用**: 速率限制工具
- **主要方法**:
  - `checkRateLimit()` - 检查速率限制
  - `resetRateLimit()` - 重置速率限制

#### ErrorHandler

- **位置**: `src/utils/error-handler.ts`
- **作用**: 错误处理工具
- **主要方法**:
  - `withErrorHandling()` - 错误处理包装器

#### TimeWheel

- **位置**: `src/utils/time-wheel.ts`
- **作用**: 时间轮算法实现
- **主要方法**:
  - `getTimeWheelInstance()` - 获取时间轮实例

#### Logger

- **位置**: `src/utils/logger.ts`
- **作用**: 日志工具
- **主要方法**:
  - `createLogger()` - 创建日志器

#### 邮箱验证

- **位置**: `src/utils.ts`
- **作用**: 通用工具函数
- **主要方法**:
  - `isValidEmail()` - 验证邮箱地址

### 🏢 服务模块 (Services Module)

**导入路径**: `@repo/lib/services` 或 `@repo/lib`

#### RBACService

- **位置**: `src/services/rbac-service.ts`
- **作用**: 基于角色的访问控制服务
- **主要方法**:
  - `getUserPermissions()` - 获取用户权限
  - `checkPermission()` - 检查权限

#### PermissionService

- **位置**: `src/services/permission-service.ts`
- **作用**: 权限管理服务
- **主要方法**:
  - `createPermission()` - 创建权限
  - `updatePermission()` - 更新权限

### 🚀 中间件模块 (Middleware Module)

**导入路径**: `@repo/lib/middleware` 或 `@repo/lib`

#### BearerAuth

- **位置**: `src/middleware/bearer-auth.ts`
- **作用**: Bearer 令牌认证中间件

#### CORS

- **位置**: `src/middleware/cors.ts`
- **作用**: 跨域资源共享中间件

### 📝 类型定义 (Types)

**导入路径**: `@repo/lib/types` 或 `@repo/lib`

#### API 类型

- **位置**: `src/types/api.ts`
- **作用**: API 相关类型定义

### ❌ 错误处理 (Errors)

**导入路径**: `@repo/lib/errors` 或 `@repo/lib`

#### OAuth2ErrorCode

- **位置**: `src/errors.ts`
- **作用**: OAuth2 错误代码定义

### 💾 缓存 (Cache)

**导入路径**: `@repo/lib/cache` 或 `@repo/lib`

#### 缓存工具

- **位置**: `src/cache.ts`
- **作用**: 缓存管理工具

## 导入示例

```typescript
// 推荐：从根路径导入
import { AuthorizationUtils, JWTUtils, PKCEUtils } from '@repo/lib';
import { RBACService } from '@repo/lib';
import { isValidEmail } from '@repo/lib';

// 或者从子模块导入
import { AuthorizationUtils } from '@repo/lib/auth';
import { RBACService } from '@repo/lib/services';
import { isValidEmail } from '@repo/lib/utils';
```

## 注意事项

1. **避免循环导入**: 不要在 @repo/lib 内部使用相对路径导入
2. **统一导入路径**: 优先使用 `@repo/lib` 根路径导入
3. **类型安全**: 所有导出都包含完整的 TypeScript 类型定义
4. **模块边界**: 每个模块职责单一，避免跨模块依赖
