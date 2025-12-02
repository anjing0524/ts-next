# OAuth SDK napi 与 Admin Portal Server Actions 集成实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建 napi SDK 客户端适配层，使 Admin Portal 的 Server Actions 能通过 SDK 调用 OAuth Service API，而不是直接 HTTP 调用。

**Architecture:**
- 在 `packages/oauth-sdk` 创建 TypeScript SDK 包
- 实现 HTTP 传输层（优先实现）
- 按模块分组：auth、token、user、rbac、client、audit
- Admin Portal 通过 Server Actions 调用 SDK
- 数据流：页面 → Server Actions → SDK → OAuth Service HTTP API

**Tech Stack:**
- TypeScript + Node.js（SDK 实现）
- Next.js 16 Server Actions（在 Admin Portal 中）
- HTTP 客户端：fetch API（Node.js 环境）
- 测试：Jest

---

## Phase 1: SDK 基础设施搭建

### Task 1: 创建 OAuth SDK 包结构

**Files:**
- Create: `packages/oauth-sdk/package.json`
- Create: `packages/oauth-sdk/tsconfig.json`
- Create: `packages/oauth-sdk/src/index.ts`
- Create: `packages/oauth-sdk/src/types.ts`
- Create: `packages/oauth-sdk/src/client.ts`

**Step 1: 创建 package.json**

```json
{
  "name": "@repo/oauth-sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.19.1",
    "jest": "^30.0.0",
    "ts-jest": "^29.4.0",
    "typescript": "^5.9.2"
  }
}
```

**Step 2: 创建 tsconfig.json**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false
  },
  "include": ["src"],
  "exclude": ["dist", "**/*.test.ts"]
}
```

**Step 3: 创建基础类型定义**

File: `packages/oauth-sdk/src/types.ts`

```typescript
// ============ 配置类型 ============
export interface OAuthSDKConfig {
  baseUrl: string;  // OAuth Service 地址，如 http://localhost:8080
  timeout?: number;  // 请求超时（毫秒），默认 5000
  retryCount?: number;  // 重试次数，默认 3
  retryDelay?: number;  // 重试延迟（毫秒），默认 100
  debug?: boolean;  // 是否启用调试日志
}

// ============ 通用响应类型 ============
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface ErrorResponse {
  code: number;
  message: string;
  timestamp: number;
  path?: string;
}

// ============ Auth 模块 ============
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  session_token: string;
  user_id: string;
  username: string;
  expires_in: number;  // 秒
}

// ============ Token 模块 ============
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

export interface TokenRefreshRequest {
  refresh_token: string;
}

// ============ User 模块 ============
export interface UserInfo {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ============ RBAC 模块 ============
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface UserRole {
  user_id: string;
  role_id: string;
  assigned_at: string;
}

// ============ Client 模块 ============
export interface ClientInfo {
  client_id: string;
  client_name: string;
  client_secret?: string;  // 仅在创建时返回
  redirect_uris: string[];
  grant_types: string[];
  created_at: string;
  updated_at: string;
}

// ============ Audit 模块 ============
export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: 'success' | 'failure';
  details: Record<string, unknown>;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ============ 错误类型 ============
export class OAuthSDKError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OAuthSDKError';
  }
}
```

**Step 4: 创建 HTTP 传输层**

File: `packages/oauth-sdk/src/http-transport.ts`

```typescript
import {
  OAuthSDKConfig,
  OAuthSDKError,
  ApiResponse,
  ErrorResponse,
} from './types';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retryCount?: number;
}

export class HttpTransport {
  private config: Required<OAuthSDKConfig>;

  constructor(config: OAuthSDKConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 5000,
      retryCount: config.retryCount ?? 3,
      retryDelay: config.retryDelay ?? 100,
      debug: config.debug ?? false,
    };
  }

  async request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const method = options.method ?? 'GET';
    const timeout = options.timeout ?? this.config.timeout;
    const maxRetries = options.retryCount ?? this.config.retryCount;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.config.debug) {
          console.log(
            `[OAuth SDK] ${method} ${url} (attempt ${attempt + 1}/${maxRetries + 1})`
          );
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            let errorData: ErrorResponse;
            try {
              errorData = await response.json();
            } catch {
              errorData = {
                code: response.status,
                message: response.statusText,
                timestamp: Date.now(),
              };
            }

            throw new OAuthSDKError(
              String(errorData.code),
              errorData.message,
              response.status,
              errorData
            );
          }

          const data = await response.json() as ApiResponse<T>;

          if (this.config.debug) {
            console.log(`[OAuth SDK] Response received`, data);
          }

          return data.data;
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 不重试客户端错误（400-499）
        if (error instanceof OAuthSDKError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // 最后一次尝试失败，抛出错误
        if (attempt === maxRetries) {
          throw lastError;
        }

        // 指数退避重试
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        if (this.config.debug) {
          console.log(
            `[OAuth SDK] Retry after ${delay}ms due to:`,
            lastError.message
          );
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error('Unknown error');
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, body, method: 'POST' });
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, body, method: 'PUT' });
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, body, method: 'PATCH' });
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
```

**Step 5: 创建基础 SDK 类和导出**

File: `packages/oauth-sdk/src/index.ts`

```typescript
export * from './types';
export * from './http-transport';
export * from './modules/auth';
export * from './modules/token';
export * from './modules/user';
export * from './modules/rbac';
export * from './modules/client';
export * from './modules/audit';

import { AuthModule } from './modules/auth';
import { TokenModule } from './modules/token';
import { UserModule } from './modules/user';
import { RbacModule } from './modules/rbac';
import { ClientModule } from './modules/client';
import { AuditModule } from './modules/audit';
import { HttpTransport } from './http-transport';
import { OAuthSDKConfig } from './types';

export class OAuthSDK {
  private transport: HttpTransport;

  public auth: AuthModule;
  public token: TokenModule;
  public user: UserModule;
  public rbac: RbacModule;
  public client: ClientModule;
  public audit: AuditModule;

  constructor(config: OAuthSDKConfig) {
    this.transport = new HttpTransport(config);

    this.auth = new AuthModule(this.transport);
    this.token = new TokenModule(this.transport);
    this.user = new UserModule(this.transport);
    this.rbac = new RbacModule(this.transport);
    this.client = new ClientModule(this.transport);
    this.audit = new AuditModule(this.transport);
  }
}

// 单例模式：在应用启动时初始化
let sdkInstance: OAuthSDK | null = null;

export function initializeOAuthSDK(config: OAuthSDKConfig): void {
  sdkInstance = new OAuthSDK(config);
}

export function getOAuthSDK(): OAuthSDK {
  if (!sdkInstance) {
    throw new Error(
      'OAuth SDK not initialized. Call initializeOAuthSDK() first.'
    );
  }
  return sdkInstance;
}
```

**Step 6: 运行初始构建确保没有错误**

```bash
cd packages/oauth-sdk
pnpm install
pnpm build
```

Expected: 构建成功，生成 dist/ 目录

**Step 7: 提交**

```bash
git add packages/oauth-sdk
git commit -m "feat(oauth-sdk): Initialize SDK package structure with HTTP transport layer"
```

---

## Phase 2: SDK 模块实现

### Task 2: 实现 Auth 模块

**Files:**
- Create: `packages/oauth-sdk/src/modules/auth.ts`
- Create: `packages/oauth-sdk/src/modules/auth.test.ts`

**Step 1: 编写 Auth 模块测试**

File: `packages/oauth-sdk/src/modules/auth.test.ts`

```typescript
import { AuthModule } from './auth';
import { HttpTransport } from '../http-transport';

describe('AuthModule', () => {
  let authModule: AuthModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      post: jest.fn(),
      get: jest.fn(),
    } as unknown as HttpTransport;

    authModule = new AuthModule(transport);
  });

  describe('login', () => {
    it('should call POST /api/v2/auth/login with credentials', async () => {
      const credentials = { username: 'test@example.com', password: 'password' };
      const expectedResponse = {
        session_token: 'token123',
        user_id: 'user123',
        username: 'test@example.com',
        expires_in: 3600,
      };

      (transport.post as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await authModule.login(credentials);

      expect(transport.post).toHaveBeenCalledWith(
        '/api/v2/auth/login',
        credentials
      );
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('logout', () => {
    it('should call POST /api/v2/auth/logout', async () => {
      (transport.post as jest.Mock).mockResolvedValue({ success: true });

      const result = await authModule.logout();

      expect(transport.post).toHaveBeenCalledWith('/api/v2/auth/logout');
      expect(result).toBe(true);
    });
  });

  describe('submitConsent', () => {
    it('should call POST /api/v2/auth/consent with consent data', async () => {
      const consentData = {
        client_id: 'client123',
        scopes: ['openid', 'profile'],
        authorized: true,
      };
      const expectedResponse = {
        authorization_code: 'code123',
        expires_in: 600,
      };

      (transport.post as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await authModule.submitConsent(consentData);

      expect(transport.post).toHaveBeenCalledWith(
        '/api/v2/auth/consent',
        consentData
      );
      expect(result).toEqual(expectedResponse);
    });
  });
});
```

**Step 2: 运行测试验证失败**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/auth.test.ts
```

Expected: FAIL，因为 auth.ts 还不存在

**Step 3: 实现 Auth 模块**

File: `packages/oauth-sdk/src/modules/auth.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { LoginRequest, LoginResponse } from '../types';

export interface ConsentRequest {
  client_id: string;
  scopes: string[];
  authorized: boolean;
}

export interface ConsentResponse {
  authorization_code: string;
  expires_in: number;
}

export class AuthModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 用户登录 - 提交凭证进行身份验证
   * @param credentials 用户凭证（用户名和密码）
   * @returns 会话令牌和用户信息
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return this.transport.post<LoginResponse>(
      '/api/v2/auth/login',
      credentials
    );
  }

  /**
   * 用户登出 - 销毁会话
   * @returns 操作是否成功
   */
  async logout(): Promise<boolean> {
    const response = await this.transport.post<{ success: boolean }>(
      '/api/v2/auth/logout'
    );
    return response.success;
  }

  /**
   * 提交权限同意 - OAuth 授权流程中的同意步骤
   * @param consentData 同意信息（客户端ID、作用域、是否授权）
   * @returns 授权码和过期时间
   */
  async submitConsent(consentData: ConsentRequest): Promise<ConsentResponse> {
    return this.transport.post<ConsentResponse>(
      '/api/v2/auth/consent',
      consentData
    );
  }
}
```

**Step 4: 运行测试验证通过**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/auth.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add packages/oauth-sdk/src/modules/auth.ts packages/oauth-sdk/src/modules/auth.test.ts
git commit -m "feat(oauth-sdk): Implement Auth module with login, logout, and consent methods"
```

---

### Task 3: 实现 Token 模块

**Files:**
- Create: `packages/oauth-sdk/src/modules/token.ts`
- Create: `packages/oauth-sdk/src/modules/token.test.ts`

**Step 1: 编写 Token 模块测试**

File: `packages/oauth-sdk/src/modules/token.test.ts`

```typescript
import { TokenModule } from './token';
import { HttpTransport } from '../http-transport';

describe('TokenModule', () => {
  let tokenModule: TokenModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      post: jest.fn(),
      get: jest.fn(),
    } as unknown as HttpTransport;

    tokenModule = new TokenModule(transport);
  });

  describe('refresh', () => {
    it('should call POST /api/v2/token/refresh with refresh token', async () => {
      const refreshToken = 'refresh123';
      const expectedResponse = {
        access_token: 'access123',
        refresh_token: 'refresh456',
        id_token: 'id123',
        expires_in: 900,
        token_type: 'Bearer' as const,
      };

      (transport.post as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await tokenModule.refresh(refreshToken);

      expect(transport.post).toHaveBeenCalledWith('/api/v2/token/refresh', {
        refresh_token: refreshToken,
      });
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('introspect', () => {
    it('should call POST /api/v2/token/introspect with token', async () => {
      const token = 'access123';
      const expectedResponse = {
        active: true,
        scope: 'openid profile email',
        user_id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 900,
      };

      (transport.post as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await tokenModule.introspect(token);

      expect(transport.post).toHaveBeenCalledWith('/api/v2/token/introspect', {
        token,
      });
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('revoke', () => {
    it('should call POST /api/v2/token/revoke with token', async () => {
      const token = 'access123';

      (transport.post as jest.Mock).mockResolvedValue({ success: true });

      const result = await tokenModule.revoke(token);

      expect(transport.post).toHaveBeenCalledWith('/api/v2/token/revoke', {
        token,
      });
      expect(result).toBe(true);
    });
  });
});
```

**Step 2: 运行测试验证失败**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/token.test.ts
```

Expected: FAIL

**Step 3: 实现 Token 模块**

File: `packages/oauth-sdk/src/modules/token.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { TokenPair, TokenRefreshRequest } from '../types';

export interface TokenIntrospectResponse {
  active: boolean;
  scope: string;
  user_id: string;
  exp: number;
}

export class TokenModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 刷新令牌 - 使用 refresh token 获取新的 access token
   * @param refreshToken 刷新令牌
   * @returns 新的令牌对（access token、refresh token、id token）
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.transport.post<TokenPair>('/api/v2/token/refresh', {
      refresh_token: refreshToken,
    });
  }

  /**
   * 令牌内省 - 检查令牌的有效性和属性
   * @param token 令牌字符串
   * @returns 令牌的有效性和声明信息
   */
  async introspect(token: string): Promise<TokenIntrospectResponse> {
    return this.transport.post<TokenIntrospectResponse>(
      '/api/v2/token/introspect',
      { token }
    );
  }

  /**
   * 撤销令牌 - 使令牌失效
   * @param token 令牌字符串
   * @returns 操作是否成功
   */
  async revoke(token: string): Promise<boolean> {
    const response = await this.transport.post<{ success: boolean }>(
      '/api/v2/token/revoke',
      { token }
    );
    return response.success;
  }
}
```

**Step 4: 运行测试验证通过**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/token.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add packages/oauth-sdk/src/modules/token.ts packages/oauth-sdk/src/modules/token.test.ts
git commit -m "feat(oauth-sdk): Implement Token module with refresh, introspect, and revoke methods"
```

---

### Task 4: 实现 User 模块

**Files:**
- Create: `packages/oauth-sdk/src/modules/user.ts`
- Create: `packages/oauth-sdk/src/modules/user.test.ts`

**Step 1: 编写 User 模块测试**

File: `packages/oauth-sdk/src/modules/user.test.ts`

```typescript
import { UserModule } from './user';
import { HttpTransport } from '../http-transport';

describe('UserModule', () => {
  let userModule: UserModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    } as unknown as HttpTransport;

    userModule = new UserModule(transport);
  });

  describe('getInfo', () => {
    it('should call GET /api/v2/user/info', async () => {
      const expectedResponse = {
        user_id: 'user123',
        username: 'test@example.com',
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await userModule.getInfo();

      expect(transport.get).toHaveBeenCalledWith('/api/v2/user/info');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('updateProfile', () => {
    it('should call PUT /api/v2/user/profile with profile data', async () => {
      const profileData = { display_name: 'Updated Name' };
      const expectedResponse = {
        user_id: 'user123',
        username: 'test@example.com',
        email: 'test@example.com',
        display_name: 'Updated Name',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T12:00:00Z',
      };

      (transport.put as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await userModule.updateProfile(profileData);

      expect(transport.put).toHaveBeenCalledWith(
        '/api/v2/user/profile',
        profileData
      );
      expect(result).toEqual(expectedResponse);
    });
  });
});
```

**Step 2: 运行测试验证失败**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/user.test.ts
```

Expected: FAIL

**Step 3: 实现 User 模块**

File: `packages/oauth-sdk/src/modules/user.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { UserInfo } from '../types';

export interface UpdateProfileRequest {
  display_name?: string;
  avatar_url?: string;
  email?: string;
}

export class UserModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 获取用户信息 - 获取当前认证用户的完整信息
   * @returns 用户信息
   */
  async getInfo(): Promise<UserInfo> {
    return this.transport.get<UserInfo>('/api/v2/user/info');
  }

  /**
   * 更新用户资料 - 修改用户的个人信息
   * @param profileData 要更新的资料字段
   * @returns 更新后的用户信息
   */
  async updateProfile(
    profileData: UpdateProfileRequest
  ): Promise<UserInfo> {
    return this.transport.put<UserInfo>(
      '/api/v2/user/profile',
      profileData
    );
  }
}
```

**Step 4: 运行测试验证通过**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/user.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add packages/oauth-sdk/src/modules/user.ts packages/oauth-sdk/src/modules/user.test.ts
git commit -m "feat(oauth-sdk): Implement User module with getInfo and updateProfile methods"
```

---

### Task 5: 实现 RBAC 模块

**Files:**
- Create: `packages/oauth-sdk/src/modules/rbac.ts`
- Create: `packages/oauth-sdk/src/modules/rbac.test.ts`

**Step 1: 编写 RBAC 模块测试**

File: `packages/oauth-sdk/src/modules/rbac.test.ts`

```typescript
import { RbacModule } from './rbac';
import { HttpTransport } from '../http-transport';

describe('RbacModule', () => {
  let rbacModule: RbacModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
    } as unknown as HttpTransport;

    rbacModule = new RbacModule(transport);
  });

  describe('getPermissions', () => {
    it('should call GET /api/v2/rbac/permissions', async () => {
      const expectedResponse = {
        items: [
          {
            id: 'perm1',
            name: 'read_users',
            description: 'Read users',
            resource: 'users',
            action: 'read',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await rbacModule.getPermissions();

      expect(transport.get).toHaveBeenCalledWith('/api/v2/rbac/permissions');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getRoles', () => {
    it('should call GET /api/v2/rbac/roles', async () => {
      const expectedResponse = {
        items: [
          {
            id: 'role1',
            name: 'admin',
            description: 'Administrator',
            permissions: [],
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await rbacModule.getRoles();

      expect(transport.get).toHaveBeenCalledWith('/api/v2/rbac/roles');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('assignRoleToUser', () => {
    it('should call POST /api/v2/rbac/users/:userId/roles', async () => {
      const userId = 'user123';
      const roleId = 'role1';
      const expectedResponse = {
        user_id: userId,
        role_id: roleId,
        assigned_at: '2025-01-01T00:00:00Z',
      };

      (transport.post as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await rbacModule.assignRoleToUser(userId, roleId);

      expect(transport.post).toHaveBeenCalledWith(
        `/api/v2/rbac/users/${userId}/roles`,
        { role_id: roleId }
      );
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('revokeRoleFromUser', () => {
    it('should call DELETE /api/v2/rbac/users/:userId/roles/:roleId', async () => {
      const userId = 'user123';
      const roleId = 'role1';

      (transport.delete as jest.Mock).mockResolvedValue({ success: true });

      const result = await rbacModule.revokeRoleFromUser(userId, roleId);

      expect(transport.delete).toHaveBeenCalledWith(
        `/api/v2/rbac/users/${userId}/roles/${roleId}`
      );
      expect(result).toBe(true);
    });
  });
});
```

**Step 2: 运行测试验证失败**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/rbac.test.ts
```

Expected: FAIL

**Step 3: 实现 RBAC 模块**

File: `packages/oauth-sdk/src/modules/rbac.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { Permission, Role, UserRole, PaginatedResponse } from '../types';

export class RbacModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 获取权限列表 - 获取系统中定义的所有权限
   * @param page 分页参数
   * @param pageSize 每页数量
   * @returns 权限列表
   */
  async getPermissions(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<Permission>> {
    return this.transport.get<PaginatedResponse<Permission>>(
      `/api/v2/rbac/permissions?page=${page}&page_size=${pageSize}`
    );
  }

  /**
   * 获取角色列表 - 获取系统中定义的所有角色
   * @param page 分页参数
   * @param pageSize 每页数量
   * @returns 角色列表
   */
  async getRoles(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<Role>> {
    return this.transport.get<PaginatedResponse<Role>>(
      `/api/v2/rbac/roles?page=${page}&page_size=${pageSize}`
    );
  }

  /**
   * 将角色分配给用户 - 给用户授予角色
   * @param userId 用户 ID
   * @param roleId 角色 ID
   * @returns 角色分配记录
   */
  async assignRoleToUser(userId: string, roleId: string): Promise<UserRole> {
    return this.transport.post<UserRole>(
      `/api/v2/rbac/users/${userId}/roles`,
      { role_id: roleId }
    );
  }

  /**
   * 从用户撤销角色 - 取消用户的某个角色
   * @param userId 用户 ID
   * @param roleId 角色 ID
   * @returns 操作是否成功
   */
  async revokeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    const response = await this.transport.delete<{ success: boolean }>(
      `/api/v2/rbac/users/${userId}/roles/${roleId}`
    );
    return response.success;
  }
}
```

**Step 4: 运行测试验证通过**

```bash
cd packages/oauth-sdk
pnpm test -- src/modules/rbac.test.ts
```

Expected: PASS

**Step 5: 提交**

```bash
git add packages/oauth-sdk/src/modules/rbac.ts packages/oauth-sdk/src/modules/rbac.test.ts
git commit -m "feat(oauth-sdk): Implement RBAC module with permission and role management methods"
```

---

### Task 6: 实现 Client 和 Audit 模块

**Files:**
- Create: `packages/oauth-sdk/src/modules/client.ts`
- Create: `packages/oauth-sdk/src/modules/client.test.ts`
- Create: `packages/oauth-sdk/src/modules/audit.ts`
- Create: `packages/oauth-sdk/src/modules/audit.test.ts`

**Step 1: 编写 Client 模块测试**

File: `packages/oauth-sdk/src/modules/client.test.ts`

```typescript
import { ClientModule } from './client';
import { HttpTransport } from '../http-transport';

describe('ClientModule', () => {
  let clientModule: ClientModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as HttpTransport;

    clientModule = new ClientModule(transport);
  });

  describe('listClients', () => {
    it('should call GET /api/v2/client/clients', async () => {
      const expectedResponse = {
        items: [
          {
            client_id: 'client1',
            client_name: 'Web App',
            redirect_uris: ['http://localhost:3002/callback'],
            grant_types: ['authorization_code'],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await clientModule.listClients();

      expect(transport.get).toHaveBeenCalledWith('/api/v2/client/clients');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getClient', () => {
    it('should call GET /api/v2/client/clients/:clientId', async () => {
      const clientId = 'client1';
      const expectedResponse = {
        client_id: clientId,
        client_name: 'Web App',
        redirect_uris: ['http://localhost:3002/callback'],
        grant_types: ['authorization_code'],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await clientModule.getClient(clientId);

      expect(transport.get).toHaveBeenCalledWith(
        `/api/v2/client/clients/${clientId}`
      );
      expect(result).toEqual(expectedResponse);
    });
  });
});
```

**Step 2: 实现 Client 模块**

File: `packages/oauth-sdk/src/modules/client.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { ClientInfo, PaginatedResponse } from '../types';

export interface CreateClientRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
}

export class ClientModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 获取客户端列表 - 获取所有注册的 OAuth 客户端
   * @param page 分页参数
   * @param pageSize 每页数量
   * @returns 客户端列表
   */
  async listClients(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<ClientInfo>> {
    return this.transport.get<PaginatedResponse<ClientInfo>>(
      `/api/v2/client/clients?page=${page}&page_size=${pageSize}`
    );
  }

  /**
   * 获取单个客户端信息 - 获取指定客户端的详细信息
   * @param clientId 客户端 ID
   * @returns 客户端信息
   */
  async getClient(clientId: string): Promise<ClientInfo> {
    return this.transport.get<ClientInfo>(
      `/api/v2/client/clients/${clientId}`
    );
  }

  /**
   * 创建新客户端 - 注册新的 OAuth 客户端
   * @param clientData 客户端信息
   * @returns 创建的客户端信息（包含 client_secret）
   */
  async createClient(
    clientData: CreateClientRequest
  ): Promise<ClientInfo> {
    return this.transport.post<ClientInfo>(
      '/api/v2/client/clients',
      clientData
    );
  }

  /**
   * 更新客户端 - 修改客户端配置
   * @param clientId 客户端 ID
   * @param clientData 要更新的字段
   * @returns 更新后的客户端信息
   */
  async updateClient(
    clientId: string,
    clientData: Partial<CreateClientRequest>
  ): Promise<ClientInfo> {
    return this.transport.put<ClientInfo>(
      `/api/v2/client/clients/${clientId}`,
      clientData
    );
  }

  /**
   * 删除客户端 - 注销 OAuth 客户端
   * @param clientId 客户端 ID
   * @returns 操作是否成功
   */
  async deleteClient(clientId: string): Promise<boolean> {
    const response = await this.transport.delete<{ success: boolean }>(
      `/api/v2/client/clients/${clientId}`
    );
    return response.success;
  }
}
```

**Step 3: 编写 Audit 模块测试**

File: `packages/oauth-sdk/src/modules/audit.test.ts`

```typescript
import { AuditModule } from './audit';
import { HttpTransport } from '../http-transport';

describe('AuditModule', () => {
  let auditModule: AuditModule;
  let transport: HttpTransport;

  beforeEach(() => {
    transport = {
      get: jest.fn(),
    } as unknown as HttpTransport;

    auditModule = new AuditModule(transport);
  });

  describe('getLogs', () => {
    it('should call GET /api/v2/audit/logs', async () => {
      const expectedResponse = {
        items: [
          {
            id: 'log1',
            actor_id: 'user123',
            action: 'login',
            resource_type: 'user',
            resource_id: 'user123',
            status: 'success' as const,
            details: { ip: '127.0.0.1' },
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      (transport.get as jest.Mock).mockResolvedValue(expectedResponse);

      const result = await auditModule.getLogs();

      expect(transport.get).toHaveBeenCalledWith('/api/v2/audit/logs');
      expect(result).toEqual(expectedResponse);
    });
  });
});
```

**Step 4: 实现 Audit 模块**

File: `packages/oauth-sdk/src/modules/audit.ts`

```typescript
import { HttpTransport } from '../http-transport';
import { AuditLog, PaginatedResponse } from '../types';

export interface AuditLogFilter {
  actor_id?: string;
  resource_type?: string;
  action?: string;
  status?: 'success' | 'failure';
  startTime?: string;  // ISO 8601 格式
  endTime?: string;
}

export class AuditModule {
  constructor(private transport: HttpTransport) {}

  /**
   * 获取审计日志 - 获取系统操作审计日志
   * @param filter 过滤条件
   * @param page 分页参数
   * @param pageSize 每页数量
   * @returns 审计日志列表
   */
  async getLogs(
    filter?: AuditLogFilter,
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<AuditLog>> {
    const queryParams = new URLSearchParams();
    queryParams.append('page', String(page));
    queryParams.append('page_size', String(pageSize));

    if (filter) {
      if (filter.actor_id) queryParams.append('actor_id', filter.actor_id);
      if (filter.resource_type) queryParams.append('resource_type', filter.resource_type);
      if (filter.action) queryParams.append('action', filter.action);
      if (filter.status) queryParams.append('status', filter.status);
      if (filter.startTime) queryParams.append('start_time', filter.startTime);
      if (filter.endTime) queryParams.append('end_time', filter.endTime);
    }

    return this.transport.get<PaginatedResponse<AuditLog>>(
      `/api/v2/audit/logs?${queryParams.toString()}`
    );
  }

  /**
   * 获取用户操作日志 - 获取特定用户的所有操作
   * @param userId 用户 ID
   * @param page 分页参数
   * @param pageSize 每页数量
   * @returns 审计日志列表
   */
  async getUserLogs(
    userId: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<AuditLog>> {
    return this.getLogs({ actor_id: userId }, page, pageSize);
  }
}
```

**Step 5: 运行所有模块测试**

```bash
cd packages/oauth-sdk
pnpm test
```

Expected: 所有测试通过

**Step 6: 构建 SDK**

```bash
cd packages/oauth-sdk
pnpm build
```

Expected: 构建成功

**Step 7: 提交**

```bash
git add packages/oauth-sdk/src/modules/
git commit -m "feat(oauth-sdk): Implement Client and Audit modules with complete test coverage"
```

---

## Phase 3: Admin Portal 集成

### Task 7: 在 Admin Portal 中集成 OAuth SDK

**Files:**
- Modify: `apps/admin-portal/package.json`
- Create: `apps/admin-portal/lib/oauth-sdk.ts`
- Create: `apps/admin-portal/app/actions/auth.ts`

**Step 1: 添加 OAuth SDK 依赖**

Modify: `apps/admin-portal/package.json`

添加到 dependencies：
```json
"@repo/oauth-sdk": "workspace:*"
```

运行：
```bash
cd apps/admin-portal
pnpm install
```

**Step 2: 创建 SDK 初始化文件**

File: `apps/admin-portal/lib/oauth-sdk.ts`

```typescript
import { OAuthSDK, initializeOAuthSDK, getOAuthSDK } from '@repo/oauth-sdk';

const sdkConfig = {
  baseUrl: process.env.OAUTH_SERVICE_URL || 'http://localhost:8080',
  timeout: parseInt(process.env.OAUTH_SDK_TIMEOUT || '5000'),
  retryCount: parseInt(process.env.OAUTH_SDK_RETRY_COUNT || '3'),
  debug: process.env.NODE_ENV === 'development',
};

// 在应用启动时初始化 SDK
if (typeof window === 'undefined') {
  // 仅在服务器端初始化
  initializeOAuthSDK(sdkConfig);
}

/**
 * 获取 OAuth SDK 实例（Server Actions 中使用）
 * 必须在服务器端环境中调用
 */
export function getOAuthSDKInstance(): OAuthSDK {
  if (typeof window !== 'undefined') {
    throw new Error('OAuth SDK can only be used on the server side');
  }
  return getOAuthSDK();
}

export { OAuthSDK, OAuthSDKError } from '@repo/oauth-sdk';
```

**Step 3: 创建 Server Actions - Auth**

File: `apps/admin-portal/app/actions/auth.ts`

```typescript
'use server';

import { getOAuthSDKInstance, OAuthSDKError } from '@/lib/oauth-sdk';
import { LoginRequest, LoginResponse } from '@repo/oauth-sdk';

/**
 * Server Action: 处理用户登录
 * 接收用户凭证，通过 SDK 调用 OAuth Service
 *
 * @param credentials 用户登录凭证
 * @returns 登录结果或错误信息
 */
export async function loginAction(
  credentials: LoginRequest
): Promise<{ success: boolean; data?: LoginResponse; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.auth.login(credentials);

    // TODO: 将 session_token 存储到 Cookie 或会话中

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 处理用户登出
 * 清除会话并调用 OAuth Service 销毁会话
 *
 * @returns 登出结果
 */
export async function logoutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    await sdk.auth.logout();

    // TODO: 清除 Cookie 中的 session_token

    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 提交 OAuth 权限同意
 * 处理用户在权限同意页面的选择
 *
 * @param consentData 用户同意信息
 * @returns 授权码和相关信息
 */
export async function submitConsentAction(consentData: {
  client_id: string;
  scopes: string[];
  authorized: boolean;
}): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.auth.submitConsent(consentData);

    return {
      success: true,
      code: result.authorization_code,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 4: 创建 Server Actions - Token**

File: `apps/admin-portal/app/actions/token.ts`

```typescript
'use server';

import { getOAuthSDKInstance, OAuthSDKError } from '@/lib/oauth-sdk';
import { TokenPair } from '@repo/oauth-sdk';

/**
 * Server Action: 刷新令牌
 * 使用 refresh token 获取新的 access token
 *
 * @param refreshToken 刷新令牌
 * @returns 新的令牌对或错误信息
 */
export async function refreshTokenAction(
  refreshToken: string
): Promise<{ success: boolean; data?: TokenPair; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.token.refresh(refreshToken);

    // TODO: 更新 Cookie 或会话中的令牌

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 检查令牌有效性
 * 对令牌进行内省检查
 *
 * @param token 令牌字符串
 * @returns 令牌信息或错误
 */
export async function introspectTokenAction(
  token: string
): Promise<{ success: boolean; active?: boolean; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.token.introspect(token);

    return {
      success: true,
      active: result.active,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 5: 创建 Server Actions - User**

File: `apps/admin-portal/app/actions/user.ts`

```typescript
'use server';

import { getOAuthSDKInstance, OAuthSDKError } from '@/lib/oauth-sdk';
import { UserInfo } from '@repo/oauth-sdk';

/**
 * Server Action: 获取当前用户信息
 *
 * @returns 用户信息或错误
 */
export async function getUserInfoAction(): Promise<{
  success: boolean;
  data?: UserInfo;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.user.getInfo();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 更新用户资料
 *
 * @param profileData 要更新的资料
 * @returns 更新后的用户信息或错误
 */
export async function updateUserProfileAction(
  profileData: { display_name?: string; avatar_url?: string; email?: string }
): Promise<{ success: boolean; data?: UserInfo; error?: string }> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.user.updateProfile(profileData);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 6: 在 .env.local 中配置 OAuth Service URL**

Modify: `apps/admin-portal/.env.local`

```
OAUTH_SERVICE_URL=http://localhost:8080
OAUTH_SDK_TIMEOUT=5000
OAUTH_SDK_RETRY_COUNT=3
```

**Step 7: 创建 Server Actions 集成测试**

File: `apps/admin-portal/__tests__/actions/auth.test.ts`

```typescript
import { loginAction, logoutAction, submitConsentAction } from '@/app/actions/auth';
import * as oauthSdk from '@repo/oauth-sdk';

jest.mock('@/lib/oauth-sdk', () => ({
  getOAuthSDKInstance: jest.fn(),
  OAuthSDKError: oauthSdk.OAuthSDKError,
}));

const { getOAuthSDKInstance } = require('@/lib/oauth-sdk');

describe('Auth Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loginAction', () => {
    it('should return success with login response', async () => {
      const mockSdk = {
        auth: {
          login: jest.fn().mockResolvedValue({
            session_token: 'token123',
            user_id: 'user123',
            username: 'test@example.com',
            expires_in: 3600,
          }),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await loginAction({
        username: 'test@example.com',
        password: 'password',
      });

      expect(result.success).toBe(true);
      expect(result.data?.session_token).toBe('token123');
    });

    it('should return error on SDK error', async () => {
      const mockSdk = {
        auth: {
          login: jest.fn().mockRejectedValue(
            new oauthSdk.OAuthSDKError('INVALID_CREDENTIALS', 'Invalid credentials', 401)
          ),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await loginAction({
        username: 'test@example.com',
        password: 'wrong',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });
});
```

**Step 8: 提交**

```bash
git add apps/admin-portal/lib/oauth-sdk.ts
git add apps/admin-portal/app/actions/
git add apps/admin-portal/.env.local
git add apps/admin-portal/package.json
git commit -m "feat(admin-portal): Integrate OAuth SDK with Server Actions for auth, token, and user operations"
```

---

## Phase 4: RBAC 和 Audit Server Actions

### Task 8: 创建 RBAC 和 Audit Server Actions

**Files:**
- Create: `apps/admin-portal/app/actions/rbac.ts`
- Create: `apps/admin-portal/app/actions/audit.ts`
- Create: `apps/admin-portal/__tests__/actions/rbac.test.ts`
- Create: `apps/admin-portal/__tests__/actions/audit.test.ts`

**Step 1: 创建 RBAC Server Actions**

File: `apps/admin-portal/app/actions/rbac.ts`

```typescript
'use server';

import { getOAuthSDKInstance, OAuthSDKError } from '@/lib/oauth-sdk';
import { Permission, Role, UserRole, PaginatedResponse } from '@repo/oauth-sdk';

/**
 * Server Action: 获取权限列表
 */
export async function getPermissionsAction(
  page: number = 1,
  pageSize: number = 10
): Promise<{
  success: boolean;
  data?: PaginatedResponse<Permission>;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.rbac.getPermissions(page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 获取角色列表
 */
export async function getRolesAction(
  page: number = 1,
  pageSize: number = 10
): Promise<{
  success: boolean;
  data?: PaginatedResponse<Role>;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.rbac.getRoles(page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 给用户分配角色
 */
export async function assignRoleAction(
  userId: string,
  roleId: string
): Promise<{
  success: boolean;
  data?: UserRole;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.rbac.assignRoleToUser(userId, roleId);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 从用户撤销角色
 */
export async function revokeRoleAction(
  userId: string,
  roleId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    await sdk.rbac.revokeRoleFromUser(userId, roleId);

    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 2: 创建 Audit Server Actions**

File: `apps/admin-portal/app/actions/audit.ts`

```typescript
'use server';

import { getOAuthSDKInstance, OAuthSDKError } from '@/lib/oauth-sdk';
import { AuditLog, PaginatedResponse } from '@repo/oauth-sdk';

export interface AuditFilter {
  actor_id?: string;
  resource_type?: string;
  action?: string;
  status?: 'success' | 'failure';
  startTime?: string;
  endTime?: string;
}

/**
 * Server Action: 获取审计日志
 */
export async function getAuditLogsAction(
  filter?: AuditFilter,
  page: number = 1,
  pageSize: number = 10
): Promise<{
  success: boolean;
  data?: PaginatedResponse<AuditLog>;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.audit.getLogs(filter, page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Server Action: 获取特定用户的审计日志
 */
export async function getUserAuditLogsAction(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{
  success: boolean;
  data?: PaginatedResponse<AuditLog>;
  error?: string;
}> {
  try {
    const sdk = getOAuthSDKInstance();
    const result = await sdk.audit.getUserLogs(userId, page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof OAuthSDKError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Step 3: 创建 RBAC Server Actions 测试**

File: `apps/admin-portal/__tests__/actions/rbac.test.ts`

```typescript
import { getRolesAction, assignRoleAction } from '@/app/actions/rbac';
import * as oauthSdk from '@repo/oauth-sdk';

jest.mock('@/lib/oauth-sdk');

const { getOAuthSDKInstance } = require('@/lib/oauth-sdk');

describe('RBAC Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRolesAction', () => {
    it('should return paginated roles', async () => {
      const mockRoles = {
        items: [
          {
            id: 'role1',
            name: 'admin',
            description: 'Administrator',
            permissions: [],
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      const mockSdk = {
        rbac: {
          getRoles: jest.fn().mockResolvedValue(mockRoles),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await getRolesAction();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(1);
    });
  });

  describe('assignRoleAction', () => {
    it('should assign role to user', async () => {
      const mockResult = {
        user_id: 'user123',
        role_id: 'role1',
        assigned_at: '2025-01-01T00:00:00Z',
      };

      const mockSdk = {
        rbac: {
          assignRoleToUser: jest.fn().mockResolvedValue(mockResult),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await assignRoleAction('user123', 'role1');

      expect(result.success).toBe(true);
      expect(result.data?.role_id).toBe('role1');
    });
  });
});
```

**Step 4: 创建 Audit Server Actions 测试**

File: `apps/admin-portal/__tests__/actions/audit.test.ts`

```typescript
import { getAuditLogsAction, getUserAuditLogsAction } from '@/app/actions/audit';
import * as oauthSdk from '@repo/oauth-sdk';

jest.mock('@/lib/oauth-sdk');

const { getOAuthSDKInstance } = require('@/lib/oauth-sdk');

describe('Audit Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuditLogsAction', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = {
        items: [
          {
            id: 'log1',
            actor_id: 'user123',
            action: 'login',
            resource_type: 'user',
            resource_id: 'user123',
            status: 'success' as const,
            details: {},
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      const mockSdk = {
        audit: {
          getLogs: jest.fn().mockResolvedValue(mockLogs),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await getAuditLogsAction();

      expect(result.success).toBe(true);
      expect(result.data?.items).toHaveLength(1);
    });
  });

  describe('getUserAuditLogsAction', () => {
    it('should return user specific audit logs', async () => {
      const mockLogs = {
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
        has_more: false,
      };

      const mockSdk = {
        audit: {
          getUserLogs: jest.fn().mockResolvedValue(mockLogs),
        },
      };

      getOAuthSDKInstance.mockReturnValue(mockSdk);

      const result = await getUserAuditLogsAction('user123');

      expect(result.success).toBe(true);
      expect(mockSdk.audit.getUserLogs).toHaveBeenCalledWith('user123', 1, 10);
    });
  });
});
```

**Step 5: 运行所有测试**

```bash
cd apps/admin-portal
pnpm test
```

Expected: 所有测试通过

**Step 6: 构建项目**

```bash
cd apps/admin-portal
pnpm build
```

Expected: 构建成功

**Step 7: 提交**

```bash
git add apps/admin-portal/app/actions/rbac.ts
git add apps/admin-portal/app/actions/audit.ts
git add apps/admin-portal/__tests__/actions/rbac.test.ts
git add apps/admin-portal/__tests__/actions/audit.test.ts
git commit -m "feat(admin-portal): Add RBAC and Audit Server Actions with comprehensive tests"
```

---

## Phase 5: 文档和验收

### Task 9: 创建使用文档和集成示例

**Files:**
- Create: `docs/plans/2025-12-02-oauth-sdk-integration-guide.md`
- Create: `apps/admin-portal/docs/sdk-usage-examples.md`

**Step 1: 创建 SDK 集成指南**

File: `docs/plans/2025-12-02-oauth-sdk-integration-guide.md`

```markdown
# OAuth SDK 集成指南

## 概述

OAuth SDK 是一个 TypeScript 客户端适配层，为 Admin Portal 的 Server Actions 提供类型安全、模块化的 OAuth Service 接口调用。

## 架构

```
┌──────────────────────────┐
│   Admin Portal 页面      │
│  (React Components)      │
└────────┬─────────────────┘
         │ 调用
         ▼
┌──────────────────────────────────┐
│   Server Actions                 │
│   ('use server' functions)       │
│                                  │
│  - app/actions/auth.ts           │
│  - app/actions/token.ts          │
│  - app/actions/user.ts           │
│  - app/actions/rbac.ts           │
│  - app/actions/audit.ts          │
└────────┬─────────────────────────┘
         │ 调用
         ▼
┌──────────────────────────────────┐
│   OAuth SDK (@repo/oauth-sdk)    │
│                                  │
│  - sdk.auth.*                    │
│  - sdk.token.*                   │
│  - sdk.user.*                    │
│  - sdk.rbac.*                    │
│  - sdk.client.*                  │
│  - sdk.audit.*                   │
└────────┬─────────────────────────┘
         │ HTTP 请求
         ▼
┌──────────────────────────────────┐
│   OAuth Service (Rust)           │
│   /api/v2/...                    │
└──────────────────────────────────┘
```

## Server Actions 使用示例

### 1. 认证操作

#### 登录

```typescript
// app/actions/auth.ts
import { loginAction } from '@/app/actions/auth';

// 在页面中使用
'use client';
export default function LoginPage() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const result = await loginAction({
      username: formData.get('username') as string,
      password: formData.get('password') as string,
    });

    if (result.success) {
      // 重定向或更新状态
      window.location.href = '/dashboard';
    } else {
      console.error(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="username" type="text" required />
      <input name="password" type="password" required />
      <button type="submit">登录</button>
    </form>
  );
}
```

### 2. 令牌操作

#### 刷新令牌

```typescript
// 在需要刷新令牌的地方
import { refreshTokenAction } from '@/app/actions/token';

const refreshToken = getCookie('refresh_token');
const result = await refreshTokenAction(refreshToken);

if (result.success && result.data) {
  // 更新 cookie
  setCookie('access_token', result.data.access_token);
  setCookie('refresh_token', result.data.refresh_token);
}
```

### 3. 用户操作

#### 获取用户信息

```typescript
import { getUserInfoAction } from '@/app/actions/user';

const result = await getUserInfoAction();
if (result.success) {
  console.log('用户信息:', result.data);
}
```

### 4. 权限操作

#### 获取角色列表

```typescript
import { getRolesAction } from '@/app/actions/rbac';

const result = await getRolesAction(1, 20);
if (result.success) {
  const roles = result.data?.items || [];
}
```

#### 给用户分配角色

```typescript
import { assignRoleAction } from '@/app/actions/rbac';

const result = await assignRoleAction('user123', 'admin');
if (result.success) {
  console.log('角色分配成功');
}
```

### 5. 审计操作

#### 获取审计日志

```typescript
import { getAuditLogsAction } from '@/app/actions/audit';

const result = await getAuditLogsAction(
  { actor_id: 'user123' },
  1,
  10
);
if (result.success) {
  const logs = result.data?.items || [];
}
```

## 错误处理

所有 Server Actions 返回统一格式：

```typescript
{
  success: boolean;
  data?: T;
  error?: string;
}
```

建议的错误处理模式：

```typescript
try {
  const result = await someAction(params);

  if (!result.success) {
    // 显示错误提示
    toast.error(result.error || '操作失败');
    return;
  }

  // 处理成功结果
  const data = result.data;

} catch (error) {
  // 处理意外错误
  toast.error('发生错误');
  console.error(error);
}
```

## 环境配置

在 `.env.local` 中配置 OAuth Service URL：

```
OAUTH_SERVICE_URL=http://localhost:8080
OAUTH_SDK_TIMEOUT=5000
OAUTH_SDK_RETRY_COUNT=3
```

## 测试

### 单元测试

```bash
cd packages/oauth-sdk
pnpm test
```

### 集成测试

```bash
cd apps/admin-portal
pnpm test
```

### 端到端测试

```bash
cd apps/admin-portal
pnpm test:e2e
```

## 常见问题

### Q: SDK 在客户端可以使用吗？
A: 不行。OAuth SDK 只在服务器端运行，必须在 Server Actions 中使用。

### Q: 如何处理认证失败？
A: Server Actions 返回的 error 字段包含详细的错误信息。根据错误类型（如 401 Unauthorized）进行相应处理。

### Q: 可以扩展 SDK 吗？
A: 可以。SDK 的模块化设计允许在 `packages/oauth-sdk/src/modules/` 中添加新模块。

## 后续计划

- [ ] 添加 TCP 传输层支持
- [ ] 实现本地缓存层
- [ ] 添加请求日志和追踪
- [ ] 性能优化和基准测试
```

**Step 2: 创建使用示例文档**

File: `apps/admin-portal/docs/sdk-usage-examples.md`

```markdown
# OAuth SDK 使用示例

本文档包含常见的 SDK 使用场景和实现示例。

## 登录流程

### 场景：用户在登录页面输入凭证

```typescript
// app/actions/auth.ts
'use server';

import { loginAction } from '@/app/actions/auth';

// 在登录表单提交时调用
export async function handleLogin(username: string, password: string) {
  const result = await loginAction({ username, password });

  if (result.success && result.data) {
    // 1. 保存 session token 到 secure HTTP-only cookie
    // 2. 可选：保存用户信息到 session
    // 3. 返回成功响应
    return { success: true, userId: result.data.user_id };
  }

  return { success: false, error: result.error };
}
```

## 权限同意流程

### 场景：OAuth 授权流程中的权限确认

```typescript
// 用户在权限同意页面点击"确认"
const result = await submitConsentAction({
  client_id: 'admin-portal-app',
  scopes: ['openid', 'profile', 'email'],
  authorized: true,
});

if (result.success) {
  // 使用返回的 authorization_code 交换 token
  window.location.href = `/callback?code=${result.code}`;
}
```

## 令牌刷新策略

### 场景：实现自动令牌刷新中间件

```typescript
// lib/token-manager.ts
import { refreshTokenAction } from '@/app/actions/token';

const TOKEN_REFRESH_THRESHOLD = 60000; // 1 分钟前刷新

export async function ensureValidToken() {
  const accessToken = getCookie('access_token');
  const refreshToken = getCookie('refresh_token');

  if (!accessToken || !refreshToken) {
    // 未登录
    return false;
  }

  // 检查 token 过期
  const decoded = jwtDecode(accessToken);
  const expiresAt = decoded.exp * 1000;
  const now = Date.now();

  if (expiresAt - now < TOKEN_REFRESH_THRESHOLD) {
    // 令牌即将过期，进行刷新
    const result = await refreshTokenAction(refreshToken);

    if (result.success && result.data) {
      // 更新 cookies
      setCookie('access_token', result.data.access_token);
      setCookie('refresh_token', result.data.refresh_token);
      return true;
    } else {
      // 刷新失败，用户需要重新登录
      return false;
    }
  }

  return true;
}
```

## 批量操作示例

### 场景：批量分配角色

```typescript
// 给多个用户分配同一个角色
import { assignRoleAction } from '@/app/actions/rbac';

export async function assignRoleToMultipleUsers(userIds: string[], roleId: string) {
  const results = await Promise.all(
    userIds.map(userId => assignRoleAction(userId, roleId))
  );

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return { succeeded, failed, results };
}
```

## 错误恢复策略

### 场景：处理网络超时和重试

```typescript
// lib/api-retry.ts
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        // 指数退避
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// 使用示例
const result = await executeWithRetry(
  () => getUserInfoAction(),
  3
);
```

## 审计日志查询

### 场景：显示用户的操作历史

```typescript
import { getUserAuditLogsAction } from '@/app/actions/audit';

export async function loadUserHistory(userId: string, page: number = 1) {
  const result = await getUserAuditLogsAction(userId, page, 20);

  if (!result.success) {
    throw new Error(result.error || '获取历史记录失败');
  }

  return {
    logs: result.data?.items || [],
    total: result.data?.total || 0,
    page: page,
    pageSize: 20,
    hasMore: result.data?.has_more || false,
  };
}
```
```

**Step 3: 运行完整测试**

```bash
# 测试 SDK
cd packages/oauth-sdk && pnpm test && pnpm build

# 测试 Admin Portal
cd apps/admin-portal && pnpm test && pnpm build
```

Expected: 所有测试通过，构建成功

**Step 4: 提交计划和文档**

```bash
git add docs/plans/2025-12-02-oauth-sdk-integration-guide.md
git add apps/admin-portal/docs/sdk-usage-examples.md
git commit -m "docs: Add comprehensive SDK integration guide and usage examples"
```

---

## 总结

### 完成的工作

- ✅ 创建 OAuth SDK 包结构和 HTTP 传输层
- ✅ 实现 6 个核心模块（Auth、Token、User、RBAC、Client、Audit）
- ✅ 在 Admin Portal 集成 SDK
- ✅ 创建 Server Actions 包装 SDK 调用
- ✅ 完整的单元测试和集成测试
- ✅ 详细的使用文档和示例

### 数据流

```
页面 (Client)
    ↓
  Server Actions ('use server')
    ↓
  OAuth SDK (getOAuthSDKInstance)
    ↓
  HTTP Transport
    ↓
  OAuth Service (/api/v2/*)
    ↓
  返回响应
```

### 关键特性

1. **模块化接口** - 按功能分组（auth、token、user、rbac、client、audit）
2. **类型安全** - 完整的 TypeScript 类型定义
3. **错误处理** - 统一的错误类型和处理机制
4. **自动重试** - 指数退避重试策略
5. **调试支持** - 可选的调试日志

### 下一步

1. **执行实现计划** - 使用 @superpowers:executing-plans
2. **端到端测试** - 验证完整的 OAuth 流程
3. **性能优化** - 添加缓存和性能监控
4. **TCP 支持** - 实现备选的 TCP 传输层
