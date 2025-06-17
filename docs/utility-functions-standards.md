# lib工具函数统一规范

> **文档版本**: v1.0.0  
> **创建日期**: 2024-01-20  
> **最后更新**: 2024-01-20  
> **文档状态**: 正式版  
> **维护团队**: 开发团队

## 文档摘要

本文档定义了`/lib/`目录下工具函数的统一规范，包括代码结构、类型定义、错误处理、文档注释等标准，确保代码的一致性、可维护性和可测试性。

## 目录

- [1. 总体架构](#1-总体架构)
- [2. 文件组织规范](#2-文件组织规范)
- [3. 代码规范](#3-代码规范)
- [4. 类型定义规范](#4-类型定义规范)
- [5. 错误处理规范](#5-错误处理规范)
- [6. 文档注释规范](#6-文档注释规范)
- [7. 测试规范](#7-测试规范)
- [8. 导出规范](#8-导出规范)

## 1. 总体架构

### 1.1 设计原则

- **单一职责**: 每个工具函数只负责一个特定功能
- **纯函数优先**: 尽量使用纯函数，避免副作用
- **类型安全**: 完整的TypeScript类型定义
- **错误处理**: 统一的错误处理机制
- **可测试性**: 易于单元测试的函数设计
- **向后兼容**: 保持API的稳定性

### 1.2 目录结构

```
lib/
├── index.ts                 # 统一导出文件
├── types/                   # 类型定义
│   ├── index.ts
│   ├── oauth.ts
│   ├── auth.ts
│   └── permission.ts
├── oauth2/                  # OAuth2.1相关工具
│   ├── index.ts
│   ├── pkce.ts
│   ├── jwt.ts
│   └── validation.ts
├── auth/                    # 认证相关工具
│   ├── index.ts
│   ├── middleware.ts
│   ├── password.ts
│   └── session.ts
├── permission/              # 权限相关工具
│   ├── index.ts
│   ├── rbac.ts
│   ├── cache.ts
│   └── service.ts
├── utils/                   # 通用工具函数
│   ├── index.ts
│   ├── crypto.ts
│   ├── validation.ts
│   ├── cache.ts
│   └── logger.ts
└── constants/               # 常量定义
    ├── index.ts
    ├── oauth.ts
    ├── errors.ts
    └── config.ts
```

## 2. 文件组织规范

### 2.1 文件命名

- 使用小写字母和连字符: `kebab-case.ts`
- 功能模块文件: `oauth2.ts`, `middleware.ts`
- 类型定义文件: `types.ts`, `interfaces.ts`
- 常量文件: `constants.ts`, `config.ts`
- 测试文件: `*.test.ts`, `*.spec.ts`

### 2.2 文件结构模板

```typescript
/**
 * @fileoverview OAuth2.1 PKCE工具函数
 * @author 开发团队
 * @since 1.0.0
 */

// 1. 导入依赖
import { createHash, randomBytes } from 'crypto';
import type { PKCEParams, CodeChallenge } from '../types/oauth';

// 2. 常量定义
const CODE_VERIFIER_LENGTH = 128;
const CODE_CHALLENGE_METHOD = 'S256';

// 3. 类型定义（如果不在types目录）
interface LocalType {
  // ...
}

// 4. 主要功能实现
export class PKCEUtils {
  // 实现代码
}

// 5. 辅助函数
function helperFunction() {
  // 实现代码
}

// 6. 默认导出（如果需要）
export default PKCEUtils;
```

## 3. 代码规范

### 3.1 函数定义规范

```typescript
/**
 * 生成PKCE code_verifier
 * @returns {string} Base64URL编码的随机字符串
 * @throws {Error} 当随机数生成失败时抛出错误
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * console.log(verifier); // "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 * ```
 */
export function generateCodeVerifier(): string {
  try {
    const buffer = randomBytes(96);
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch (error) {
    throw new Error(`Failed to generate code verifier: ${error.message}`);
  }
}
```

### 3.2 类定义规范

```typescript
/**
 * OAuth2.1 PKCE工具类
 * 提供PKCE相关的代码生成和验证功能
 */
export class PKCEUtils {
  /**
   * 生成code_verifier
   * @static
   * @returns {string} 符合RFC 7636规范的code_verifier
   */
  static generateCodeVerifier(): string {
    // 实现代码
  }

  /**
   * 生成code_challenge
   * @static
   * @param {string} codeVerifier - code_verifier字符串
   * @param {string} method - 挑战方法，默认为'S256'
   * @returns {string} Base64URL编码的code_challenge
   */
  static generateCodeChallenge(
    codeVerifier: string,
    method: string = 'S256'
  ): string {
    // 实现代码
  }

  /**
   * 验证code_challenge
   * @static
   * @param {string} codeVerifier - 原始code_verifier
   * @param {string} codeChallenge - 要验证的code_challenge
   * @param {string} method - 挑战方法
   * @returns {boolean} 验证结果
   */
  static verifyCodeChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: string = 'S256'
  ): boolean {
    // 实现代码
  }
}
```

## 4. 类型定义规范

### 4.1 接口定义

```typescript
// types/oauth.ts

/**
 * PKCE参数接口
 */
export interface PKCEParams {
  /** code_verifier字符串 */
  codeVerifier: string;
  /** code_challenge字符串 */
  codeChallenge: string;
  /** 挑战方法，通常为'S256' */
  codeChallengeMethod: 'S256' | 'plain';
}

/**
 * OAuth2.1授权请求参数
 */
export interface AuthorizationRequest {
  /** 响应类型 */
  responseType: 'code';
  /** 客户端ID */
  clientId: string;
  /** 重定向URI */
  redirectUri: string;
  /** 权限范围 */
  scope?: string;
  /** 状态参数 */
  state?: string;
  /** PKCE code_challenge */
  codeChallenge?: string;
  /** PKCE挑战方法 */
  codeChallengeMethod?: 'S256' | 'plain';
  /** OIDC nonce */
  nonce?: string;
}

/**
 * 令牌响应接口
 */
export interface TokenResponse {
  /** 访问令牌 */
  accessToken: string;
  /** 令牌类型 */
  tokenType: 'Bearer';
  /** 过期时间（秒） */
  expiresIn: number;
  /** 刷新令牌 */
  refreshToken?: string;
  /** ID令牌（OIDC） */
  idToken?: string;
  /** 权限范围 */
  scope?: string;
}
```

### 4.2 枚举定义

```typescript
// types/auth.ts

/**
 * 认证错误类型
 */
export enum AuthErrorType {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  INVALID_TOKEN = 'INVALID_TOKEN'
}

/**
 * 权限操作类型
 */
export enum PermissionAction {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  EXECUTE = 'execute'
}
```

## 5. 错误处理规范

### 5.1 自定义错误类

```typescript
// utils/errors.ts

/**
 * 基础错误类
 */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  
  constructor(
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode
    };
  }
}

/**
 * OAuth2.1相关错误
 */
export class OAuth2Error extends BaseError {
  readonly code = 'OAUTH2_ERROR';
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly oauthError: string,
    public readonly oauthErrorDescription?: string,
    details?: Record<string, any>
  ) {
    super(message, details);
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends BaseError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
}

/**
 * 授权错误
 */
export class AuthorizationError extends BaseError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;
}
```

### 5.2 错误处理模式

```typescript
/**
 * 结果类型定义
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * 安全执行函数，返回Result类型
 */
export async function safeExecute<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * 使用示例
 */
export async function validateToken(token: string): Promise<Result<JWTPayload>> {
  return safeExecute(async () => {
    if (!token) {
      throw new AuthenticationError('Token is required');
    }
    
    const payload = await verifyJWT(token);
    return payload;
  });
}
```

## 6. 文档注释规范

### 6.1 JSDoc标准

```typescript
/**
 * 验证用户权限
 * 
 * @description 检查用户是否具有指定资源的特定权限
 * @param {string} userId - 用户ID
 * @param {string} resource - 资源标识
 * @param {PermissionAction} action - 权限操作类型
 * @param {object} [options] - 可选配置
 * @param {boolean} [options.useCache=true] - 是否使用缓存
 * @param {number} [options.timeout=5000] - 超时时间（毫秒）
 * @returns {Promise<boolean>} 权限验证结果
 * @throws {AuthenticationError} 当用户未认证时
 * @throws {AuthorizationError} 当权限验证失败时
 * 
 * @example
 * ```typescript
 * // 检查用户读取权限
 * const canRead = await checkPermission('user123', 'articles', PermissionAction.READ);
 * 
 * // 使用选项
 * const canWrite = await checkPermission('user123', 'articles', PermissionAction.WRITE, {
 *   useCache: false,
 *   timeout: 3000
 * });
 * ```
 * 
 * @since 1.0.0
 * @author 开发团队
 */
export async function checkPermission(
  userId: string,
  resource: string,
  action: PermissionAction,
  options: {
    useCache?: boolean;
    timeout?: number;
  } = {}
): Promise<boolean> {
  // 实现代码
}
```

### 6.2 类型注释

```typescript
/**
 * JWT令牌载荷
 * @interface JWTPayload
 */
export interface JWTPayload {
  /** 主题（用户ID） */
  sub: string;
  /** 签发者 */
  iss: string;
  /** 受众 */
  aud: string | string[];
  /** 过期时间（Unix时间戳） */
  exp: number;
  /** 签发时间（Unix时间戳） */
  iat: number;
  /** 不早于时间（Unix时间戳） */
  nbf?: number;
  /** JWT ID */
  jti?: string;
  /** 权限范围 */
  scope?: string;
  /** 自定义声明 */
  [key: string]: any;
}
```

## 7. 测试规范

### 7.1 单元测试结构

```typescript
// __tests__/oauth2/pkce.test.ts

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PKCEUtils } from '../../oauth2/pkce';

describe('PKCEUtils', () => {
  describe('generateCodeVerifier', () => {
    test('应该生成符合长度要求的code_verifier', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      
      expect(verifier).toBeDefined();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    test('应该生成URL安全的字符串', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    test('每次生成的verifier应该不同', () => {
      const verifier1 = PKCEUtils.generateCodeVerifier();
      const verifier2 = PKCEUtils.generateCodeVerifier();
      
      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe('generateCodeChallenge', () => {
    test('应该为相同的verifier生成相同的challenge', () => {
      const verifier = 'test-verifier-123';
      const challenge1 = PKCEUtils.generateCodeChallenge(verifier);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(challenge1).toBe(challenge2);
    });

    test('应该生成Base64URL编码的字符串', () => {
      const verifier = 'test-verifier-123';
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });
  });

  describe('verifyCodeChallenge', () => {
    test('应该验证正确的verifier和challenge组合', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      const isValid = PKCEUtils.verifyCodeChallenge(verifier, challenge);
      expect(isValid).toBe(true);
    });

    test('应该拒绝错误的verifier和challenge组合', () => {
      const verifier1 = PKCEUtils.generateCodeVerifier();
      const verifier2 = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier1);
      
      const isValid = PKCEUtils.verifyCodeChallenge(verifier2, challenge);
      expect(isValid).toBe(false);
    });
  });
});
```

### 7.2 集成测试示例

```typescript
// __tests__/integration/auth-flow.test.ts

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/database';
import { createTestClient, createTestUser } from '../helpers/factories';
import { PKCEUtils } from '../../oauth2/pkce';
import { AuthService } from '../../auth/service';

describe('OAuth2.1 Authorization Flow Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  test('完整的授权码流程应该成功', async () => {
    // 准备测试数据
    const client = await createTestClient();
    const user = await createTestUser();
    const { codeVerifier, codeChallenge } = PKCEUtils.generatePKCEPair();

    // 1. 授权请求
    const authResult = await AuthService.authorize({
      responseType: 'code',
      clientId: client.clientId,
      redirectUri: client.redirectUris[0],
      scope: 'openid profile',
      codeChallenge,
      codeChallengeMethod: 'S256',
      userId: user.id
    });

    expect(authResult.success).toBe(true);
    expect(authResult.data.code).toBeDefined();

    // 2. 令牌交换
    const tokenResult = await AuthService.exchangeToken({
      grantType: 'authorization_code',
      code: authResult.data.code,
      redirectUri: client.redirectUris[0],
      clientId: client.clientId,
      codeVerifier
    });

    expect(tokenResult.success).toBe(true);
    expect(tokenResult.data.accessToken).toBeDefined();
    expect(tokenResult.data.refreshToken).toBeDefined();
  });
});
```

## 8. 导出规范

### 8.1 统一导出文件

```typescript
// lib/index.ts

// OAuth2.1相关导出
export * from './oauth2';
export { PKCEUtils } from './oauth2/pkce';
export { JWTUtils } from './oauth2/jwt';

// 认证相关导出
export * from './auth';
export { authMiddleware } from './auth/middleware';
export { PasswordUtils } from './auth/password';

// 权限相关导出
export * from './permission';
export { PermissionService } from './permission/service';
export { RBACUtils } from './permission/rbac';

// 工具函数导出
export * from './utils';
export { CryptoUtils } from './utils/crypto';
export { ValidationUtils } from './utils/validation';
export { CacheUtils } from './utils/cache';
export { Logger } from './utils/logger';

// 类型定义导出
export * from './types';

// 常量导出
export * from './constants';

// 错误类导出
export * from './utils/errors';
```

### 8.2 模块导出文件

```typescript
// lib/oauth2/index.ts

export { PKCEUtils } from './pkce';
export { JWTUtils } from './jwt';
export { OAuth2Validator } from './validation';

// 重新导出类型
export type {
  PKCEParams,
  AuthorizationRequest,
  TokenResponse
} from '../types/oauth';

// 重新导出常量
export {
  OAUTH2_GRANT_TYPES,
  OAUTH2_RESPONSE_TYPES,
  OAUTH2_SCOPES
} from '../constants/oauth';
```

### 8.3 使用示例

```typescript
// 在应用代码中使用
import {
  PKCEUtils,
  authMiddleware,
  PermissionService,
  AuthenticationError,
  type AuthorizationRequest
} from '@/lib';

// 或者按模块导入
import { PKCEUtils } from '@/lib/oauth2';
import { authMiddleware } from '@/lib/auth';
import { PermissionService } from '@/lib/permission';
```

## 9. 版本管理

### 9.1 语义化版本

- **主版本号**: 不兼容的API修改
- **次版本号**: 向后兼容的功能性新增
- **修订号**: 向后兼容的问题修正

### 9.2 变更日志

```markdown
# 变更日志

## [1.1.0] - 2024-01-20

### 新增
- 添加JWT令牌轮换功能
- 支持Redis缓存配置

### 修改
- 优化权限查询性能
- 更新错误消息格式

### 修复
- 修复PKCE验证边界情况
- 解决内存泄漏问题

### 废弃
- `oldFunction()` 将在v2.0.0中移除

## [1.0.0] - 2024-01-15

### 新增
- 初始版本发布
- OAuth2.1核心功能
- RBAC权限系统
```

## 10. 最佳实践

### 10.1 性能优化

- 使用缓存减少数据库查询
- 避免在循环中进行异步操作
- 合理使用Promise.all并行处理
- 实现适当的错误边界

### 10.2 安全考虑

- 敏感信息不要记录到日志
- 使用常量时间比较防止时序攻击
- 验证所有输入参数
- 实现适当的速率限制

### 10.3 可维护性

- 保持函数简洁，单一职责
- 使用有意义的变量和函数名
- 添加充分的测试覆盖
- 定期重构和优化代码

---

**注意**: 本规范是活文档，会根据项目发展和最佳实践的演进持续更新。所有开发人员都应遵循此规范，确保代码质量和团队协作效率。