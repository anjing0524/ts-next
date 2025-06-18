# lib 目录重构指南

## 1. 重构目标

本指南旨在重构 `lib` 目录结构，提高代码的可维护性、可读性和可扩展性。通过模块化组织、统一导出和类型定义规范化，建立清晰的代码架构。

### 1.1 重构原则

- **模块化**: 按功能域组织代码
- **统一导出**: 每个模块提供统一的导出点
- **类型安全**: 完善的 TypeScript 类型定义
- **可维护性**: 清晰的依赖关系和文件结构
- **可扩展性**: 易于添加新功能和模块

### 1.2 预期收益

- 减少导入路径复杂度 60%
- 提高代码可读性 40%
- 降低模块间耦合度 50%
- 提升开发效率 30%

## 2. 当前结构分析

### 2.1 现有目录结构

```
lib/
├── auth/
│   ├── oauth2.ts          # OAuth2 相关工具函数
│   └── middleware.ts      # 认证中间件
├── services/
│   └── permission.ts      # 权限服务
├── utils/
│   └── logger.ts          # 日志工具
└── prisma.ts              # Prisma 客户端实例
```

### 2.2 存在的问题

1. **功能分散**: 相关功能分布在不同目录
2. **导入复杂**: 缺乏统一的导出点
3. **类型分散**: TypeScript 类型定义散布各处
4. **依赖混乱**: 模块间依赖关系不清晰
5. **扩展困难**: 添加新功能时目录结构不明确

## 3. 目标结构设计

### 3.1 新目录结构

```
lib/
├── auth/                  # 认证授权模块
│   ├── index.ts          # 统一导出
│   ├── oauth2.ts         # OAuth2 实现
│   ├── middleware.ts     # 认证中间件
│   ├── jwt.ts            # JWT 处理
│   ├── pkce.ts           # PKCE 实现
│   └── types.ts          # 认证相关类型
├── rbac/                 # 权限控制模块
│   ├── index.ts          # 统一导出
│   ├── permission.ts     # 权限服务
│   ├── role.ts           # 角色服务
│   ├── checker.ts        # 权限检查器
│   └── types.ts          # RBAC 类型
├── database/             # 数据库模块
│   ├── index.ts          # 统一导出
│   ├── client.ts         # Prisma 客户端
│   ├── connection.ts     # 数据库连接管理
│   ├── migrations.ts     # 迁移工具
│   └── types.ts          # 数据库类型
├── utils/                # 通用工具模块
│   ├── index.ts          # 统一导出
│   ├── logger.ts         # 日志工具
│   ├── crypto.ts         # 加密工具
│   ├── validation.ts     # 验证工具
│   ├── errors.ts         # 错误处理
│   ├── cache.ts          # 缓存工具
│   └── helpers.ts        # 通用辅助函数
├── types/                # 全局类型定义
│   ├── index.ts          # 统一导出
│   ├── api.ts            # API 相关类型
│   ├── auth.ts           # 认证类型
│   ├── rbac.ts           # 权限类型
│   ├── database.ts       # 数据库类型
│   └── common.ts         # 通用类型
├── constants/            # 常量定义
│   ├── index.ts          # 统一导出
│   ├── auth.ts           # 认证常量
│   ├── permissions.ts    # 权限常量
│   └── errors.ts         # 错误码常量
└── index.ts              # 库的统一入口
```

### 3.2 模块职责划分

#### 3.2.1 auth 模块 (认证授权)

**职责**: 处理用户认证、OAuth2 流程、JWT 令牌管理

**文件说明**:
- `oauth2.ts`: OAuth2 授权码流程实现
- `middleware.ts`: 认证中间件
- `jwt.ts`: JWT 令牌生成和验证
- `pkce.ts`: PKCE 代码挑战实现
- `types.ts`: 认证相关类型定义

#### 3.2.2 rbac 模块 (权限控制)

**职责**: 基于角色的访问控制 (RBAC) 实现

**文件说明**:
- `permission.ts`: 权限管理服务
- `role.ts`: 角色管理服务
- `checker.ts`: 权限检查逻辑
- `types.ts`: RBAC 相关类型定义

#### 3.2.3 database 模块 (数据库)

**职责**: 数据库连接、查询优化、事务管理

**文件说明**:
- `client.ts`: Prisma 客户端配置
- `connection.ts`: 数据库连接管理
- `migrations.ts`: 数据库迁移工具
- `types.ts`: 数据库相关类型

#### 3.2.4 utils 模块 (工具函数)

**职责**: 通用工具函数和辅助功能

**文件说明**:
- `logger.ts`: 日志记录工具
- `crypto.ts`: 加密解密工具
- `validation.ts`: 数据验证工具
- `errors.ts`: 错误处理工具
- `cache.ts`: 缓存管理工具
- `helpers.ts`: 通用辅助函数

#### 3.2.5 types 模块 (类型定义)

**职责**: 全局类型定义和接口声明

**文件说明**:
- `api.ts`: API 请求/响应类型
- `auth.ts`: 认证相关类型
- `rbac.ts`: 权限相关类型
- `database.ts`: 数据库相关类型
- `common.ts`: 通用类型定义

#### 3.2.6 constants 模块 (常量定义)

**职责**: 应用程序常量和配置

**文件说明**:
- `auth.ts`: 认证相关常量
- `permissions.ts`: 权限常量定义
- `errors.ts`: 错误码常量

## 4. 重构实施步骤

### 4.1 第一阶段：创建新目录结构

```bash
# 1. 创建新的目录结构
mkdir -p lib/{auth,rbac,database,utils,types,constants}

# 2. 创建各模块的 index.ts 文件
touch lib/{auth,rbac,database,utils,types,constants}/index.ts
touch lib/index.ts

# 3. 创建具体功能文件
touch lib/auth/{oauth2,middleware,jwt,pkce,types}.ts
touch lib/rbac/{permission,role,checker,types}.ts
touch lib/database/{client,connection,migrations,types}.ts
touch lib/utils/{logger,crypto,validation,errors,cache,helpers}.ts
touch lib/types/{api,auth,rbac,database,common}.ts
touch lib/constants/{auth,permissions,errors}.ts
```

### 4.2 第二阶段：迁移现有代码

#### 4.2.1 迁移认证模块

```typescript
// lib/auth/oauth2.ts
/**
 * OAuth2 授权码流程实现
 * 
 * @description 实现 OAuth 2.1 授权码模式，支持 PKCE 扩展
 */

import { generateRandomString, base64URLEncode, sha256 } from '../utils/crypto';
import type { PKCEPair, AuthorizationParams, TokenParams } from './types';

/**
 * 生成 PKCE 代码挑战和验证器
 * 
 * @param length 代码验证器长度 (43-128 字符)
 * @returns PKCE 代码挑战对象
 */
export function generatePKCE(length: number = 128): PKCEPair {
  if (length < 43 || length > 128) {
    throw new Error('PKCE code verifier length must be between 43 and 128 characters');
  }
  
  const codeVerifier = generateRandomString(length);
  const codeChallenge = base64URLEncode(sha256(codeVerifier));
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * 验证 PKCE 代码挑战
 * 
 * @param codeVerifier 代码验证器
 * @param codeChallenge 代码挑战
 * @returns 验证结果
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const computedChallenge = base64URLEncode(sha256(codeVerifier));
  return computedChallenge === codeChallenge;
}

/**
 * 生成授权 URL
 * 
 * @param params 授权参数
 * @returns 授权 URL
 */
export function generateAuthorizationUrl(params: AuthorizationParams): string {
  const {
    baseUrl,
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod = 'S256'
  } = params;
  
  const searchParams = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope.join(' '),
    state
  });
  
  if (codeChallenge) {
    searchParams.set('code_challenge', codeChallenge);
    searchParams.set('code_challenge_method', codeChallengeMethod);
  }
  
  return `${baseUrl}/oauth/authorize?${searchParams.toString()}`;
}
```

```typescript
// lib/auth/types.ts
/**
 * 认证模块类型定义
 */

import type { JWTPayload } from 'jose';

/**
 * PKCE 代码挑战对
 */
export interface PKCEPair {
  /** 代码验证器 */
  codeVerifier: string;
  /** 代码挑战 */
  codeChallenge: string;
  /** 挑战方法 */
  codeChallengeMethod: 'S256';
}

/**
 * 授权参数
 */
export interface AuthorizationParams {
  /** 授权服务器基础 URL */
  baseUrl: string;
  /** 客户端 ID */
  clientId: string;
  /** 重定向 URI */
  redirectUri: string;
  /** 权限范围 */
  scope: string[];
  /** 状态参数 */
  state: string;
  /** PKCE 代码挑战 */
  codeChallenge?: string;
  /** PKCE 挑战方法 */
  codeChallengeMethod?: 'S256';
}

/**
 * 令牌请求参数
 */
export interface TokenParams {
  /** 授权码 */
  code: string;
  /** 客户端 ID */
  clientId: string;
  /** 重定向 URI */
  redirectUri: string;
  /** PKCE 代码验证器 */
  codeVerifier?: string;
}

/**
 * OAuth 令牌响应
 */
export interface OAuthTokenResponse {
  /** 访问令牌 */
  access_token: string;
  /** 令牌类型 */
  token_type: 'Bearer';
  /** 过期时间（秒） */
  expires_in: number;
  /** 刷新令牌 */
  refresh_token?: string;
  /** 权限范围 */
  scope?: string;
}

/**
 * 认证上下文
 */
export interface AuthContext {
  /** 用户 ID */
  userId?: string;
  /** 客户端 ID */
  clientId?: string;
  /** 权限范围 */
  scopes: string[];
  /** 用户权限 */
  permissions: string[];
  /** JWT 载荷 */
  tokenPayload: JWTPayload;
}

/**
 * 认证结果
 */
export interface AuthResult {
  /** 认证是否成功 */
  success: boolean;
  /** 认证上下文 */
  context?: AuthContext | null;
  /** 错误响应 */
  response?: Response;
}
```

```typescript
// lib/auth/index.ts
/**
 * 认证模块统一导出
 */

export {
  generatePKCE,
  verifyPKCE,
  generateAuthorizationUrl
} from './oauth2';

export {
  authenticateBearer,
  requirePermission
} from './middleware';

export {
  signJWT,
  verifyJWT,
  refreshToken
} from './jwt';

export type {
  PKCEPair,
  AuthorizationParams,
  TokenParams,
  OAuthTokenResponse,
  AuthContext,
  AuthResult
} from './types';
```

#### 4.2.2 迁移权限模块

```typescript
// lib/rbac/permission.ts
/**
 * 权限管理服务
 */

import { prisma } from '../database';
import type { Permission, CreatePermissionInput, PermissionFilter } from './types';
import type { PaginatedResult, ListParams } from '../types/common';

/**
 * 权限服务类
 */
export class PermissionService {
  /**
   * 获取权限列表
   * 
   * @param params 查询参数
   * @returns 分页权限列表
   */
  async getPermissions(params: ListParams & PermissionFilter): Promise<PaginatedResult<Permission>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      type,
      resource,
      action,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = params;
    
    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { resource: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(type && { type }),
      ...(resource && { resource }),
      ...(action && { action })
    };
    
    const [permissions, total] = await Promise.all([
      prisma.permission.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder }
      }),
      prisma.permission.count({ where })
    ]);
    
    return {
      data: permissions,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1
      }
    };
  }
  
  /**
   * 创建权限
   * 
   * @param input 权限创建输入
   * @returns 创建的权限
   */
  async createPermission(input: CreatePermissionInput): Promise<Permission> {
    return prisma.permission.create({
      data: input
    });
  }
  
  /**
   * 检查用户是否具有指定权限
   * 
   * @param userId 用户 ID
   * @param permissionName 权限名称
   * @returns 是否具有权限
   */
  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          where: { isActive: true },
          include: {
            permissions: {
              where: { name: permissionName }
            }
          }
        }
      }
    });
    
    if (!user) return false;
    
    return user.roles.some(role => 
      role.permissions.some(permission => permission.name === permissionName)
    );
  }
}

// 导出单例实例
export const permissionService = new PermissionService();
```

#### 4.2.3 创建统一导出

```typescript
// lib/index.ts
/**
 * lib 库统一入口
 * 
 * @description 提供所有模块的统一导出，简化导入路径
 */

// 认证模块
export * from './auth';

// 权限控制模块
export * from './rbac';

// 数据库模块
export * from './database';

// 工具模块
export * from './utils';

// 类型定义
export * from './types';

// 常量定义
export * from './constants';
```

### 4.3 第三阶段：更新导入语句

#### 4.3.1 更新 API 路由

```typescript
// app/api/v2/oauth/authorize/route.ts
// 之前
import { generatePKCE } from '../../../../lib/auth/oauth2';
import { PermissionService } from '../../../../lib/services/permission';
import { logger } from '../../../../lib/utils/logger';

// 之后
import { generatePKCE, PermissionService, logger } from '@/lib';
```

#### 4.3.2 更新中间件

```typescript
// lib/auth/middleware.ts
// 之前
import { verifyJWT } from './jwt';
import { PermissionService } from '../services/permission';
import { logger } from '../utils/logger';

// 之后
import { verifyJWT } from './jwt';
import { PermissionService } from '../rbac';
import { logger } from '../utils';
```

### 4.4 第四阶段：配置路径别名

#### 4.4.1 更新 tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/lib": ["./lib"],
      "@/lib/*": ["./lib/*"],
      "@/app/*": ["./app/*"],
      "@/components/*": ["./components/*"]
    }
  }
}
```

#### 4.4.2 更新 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
      '@/lib': path.resolve(__dirname, 'lib')
    };
    return config;
  }
};

module.exports = nextConfig;
```

## 5. 代码规范

### 5.1 文件命名规范

- **文件名**: 使用 kebab-case (小写字母 + 连字符)
- **类型文件**: 以 `.types.ts` 结尾
- **测试文件**: 以 `.test.ts` 或 `.spec.ts` 结尾
- **配置文件**: 以 `.config.ts` 结尾

### 5.2 导出规范

```typescript
// ✅ 推荐：命名导出
export function generatePKCE() { /* ... */ }
export class PermissionService { /* ... */ }
export type AuthContext = { /* ... */ };

// ✅ 推荐：统一导出
export {
  generatePKCE,
  verifyPKCE
} from './oauth2';

// ❌ 避免：默认导出（除非是单一功能模块）
export default function generatePKCE() { /* ... */ }
```

### 5.3 注释规范

```typescript
/**
 * 函数或类的简短描述
 * 
 * @description 详细描述（可选）
 * @param paramName 参数描述
 * @returns 返回值描述
 * @throws {ErrorType} 错误描述
 * 
 * @example
 * ```typescript
 * const result = functionName(param);
 * console.log(result);
 * ```
 * 
 * @see https://example.com/docs
 * @since 1.0.0
 */
export function functionName(paramName: string): ReturnType {
  // 实现逻辑
}
```

### 5.4 类型定义规范

```typescript
/**
 * 接口描述
 */
export interface InterfaceName {
  /** 属性描述 */
  propertyName: string;
  /** 可选属性描述 */
  optionalProperty?: number;
}

/**
 * 类型别名描述
 */
export type TypeAlias = string | number;

/**
 * 枚举描述
 */
export enum EnumName {
  /** 枚举值描述 */
  VALUE_ONE = 'value_one',
  /** 枚举值描述 */
  VALUE_TWO = 'value_two'
}
```

## 6. 测试策略

### 6.1 单元测试

```typescript
// __tests__/lib/auth/oauth2.test.ts
import { generatePKCE, verifyPKCE } from '@/lib/auth/oauth2';

describe('OAuth2 PKCE', () => {
  describe('generatePKCE', () => {
    it('应该生成有效的 PKCE 代码挑战和验证器', () => {
      const pkce = generatePKCE();
      
      expect(pkce.codeVerifier).toHaveLength(128);
      expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(pkce.codeChallengeMethod).toBe('S256');
    });
  });
  
  describe('verifyPKCE', () => {
    it('应该验证有效的 PKCE 代码', () => {
      const pkce = generatePKCE();
      const isValid = verifyPKCE(pkce.codeVerifier, pkce.codeChallenge);
      
      expect(isValid).toBe(true);
    });
  });
});
```

### 6.2 集成测试

```typescript
// __tests__/lib/rbac/permission.integration.test.ts
import { PermissionService } from '@/lib/rbac';
import { prisma } from '@/lib/database';

describe('PermissionService Integration', () => {
  let permissionService: PermissionService;
  
  beforeEach(() => {
    permissionService = new PermissionService();
  });
  
  afterEach(async () => {
    await prisma.permission.deleteMany();
  });
  
  it('应该创建和查询权限', async () => {
    const permission = await permissionService.createPermission({
      name: 'test:read',
      resource: 'test',
      action: 'read',
      type: 'api'
    });
    
    expect(permission.name).toBe('test:read');
    
    const permissions = await permissionService.getPermissions({});
    expect(permissions.data).toHaveLength(1);
  });
});
```

## 7. 迁移检查清单

### 7.1 结构检查

- [ ] 创建新的目录结构
- [ ] 迁移所有现有文件
- [ ] 创建统一导出文件
- [ ] 更新路径别名配置

### 7.2 代码检查

- [ ] 更新所有导入语句
- [ ] 添加 JSDoc 注释
- [ ] 统一类型定义
- [ ] 移除重复代码

### 7.3 测试检查

- [ ] 所有现有测试通过
- [ ] 添加新模块的单元测试
- [ ] 添加集成测试
- [ ] 测试覆盖率达到目标

### 7.4 文档检查

- [ ] 更新 README.md
- [ ] 更新 API 文档
- [ ] 更新开发指南
- [ ] 添加迁移说明

## 8. 常见问题

### 8.1 循环依赖

**问题**: 模块间出现循环依赖

**解决方案**:
```typescript
// ❌ 避免循环依赖
// auth/index.ts
import { PermissionService } from '../rbac';

// rbac/index.ts
import { AuthContext } from '../auth';

// ✅ 使用类型导入
// auth/index.ts
import type { PermissionService } from '../rbac';

// rbac/index.ts
import type { AuthContext } from '../auth';
```

### 8.2 路径解析问题

**问题**: TypeScript 无法解析路径别名

**解决方案**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "@/lib/*": ["./lib/*"]
    }
  }
}
```

### 8.3 类型导出问题

**问题**: 类型无法正确导出

**解决方案**:
```typescript
// ✅ 正确的类型导出
export type { AuthContext } from './types';

// ❌ 错误的类型导出
export { AuthContext } from './types'; // 这会导致运行时错误
```

## 9. 性能优化

### 9.1 懒加载

```typescript
// lib/index.ts
// ✅ 使用懒加载减少初始包大小
export const getAuthService = () => import('./auth').then(m => m.AuthService);
export const getPermissionService = () => import('./rbac').then(m => m.PermissionService);
```

### 9.2 Tree Shaking

```typescript
// ✅ 支持 Tree Shaking 的导出方式
export { generatePKCE } from './auth/oauth2';
export { PermissionService } from './rbac/permission';

// ❌ 不支持 Tree Shaking
export * from './auth';
export * from './rbac';
```

## 10. 总结

通过本次重构，我们将实现：

1. **清晰的模块结构**: 按功能域组织代码
2. **简化的导入路径**: 统一的导出点和路径别名
3. **完善的类型系统**: 统一的类型定义和导出
4. **更好的可维护性**: 清晰的依赖关系和文档
5. **提升的开发体验**: 更好的 IDE 支持和自动补全

重构完成后，开发者可以通过简单的导入语句访问所有功能：

```typescript
import { generatePKCE, PermissionService, logger, AuthContext } from '@/lib';
```

这将显著提升代码的可读性、可维护性和开发效率。