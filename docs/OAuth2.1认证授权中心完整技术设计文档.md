# OAuth2.1认证授权中心完整技术设计文档

# OAuth2.1认证授权中心技术设计文档

**文档版本**: v2.0  
**创建日期**: 2024-01-15  
**最后更新**: 2024-01-15  
**文档状态**: 正式版  
**维护团队**: 认证授权团队  

**文档摘要**: 本文档详细描述了OAuth2.1认证授权中心的完整技术设计，专注于内网环境下的认证授权核心功能，包括OAuth2.1授权码模式、客户端认证模式、强制PKCE、OIDC公钥获取和RBAC权限模型。

## 目录

1. [系统概述](#1-系统概述)
2. [系统架构设计](#2-系统架构设计)
3. [OAuth2.1核心实现](#3-oauth21核心实现)
4. [RBAC权限模型](#4-rbac权限模型)
5. [数据库设计](#5-数据库设计)
6. [安全机制](#6-安全机制)
7. [API设计](#7-api设计)
8. [部署架构](#8-部署架构)

## 1. 系统概述

### 1.1 系统定位
本系统是专为**企业内网环境**设计的OAuth2.1认证授权中心，作为企业应用生态的核心基础设施。系统安全边界由企业网络保障，专注于内网环境下的高效认证和精细化权限控制。

### 1.2 核心特性
- **OAuth2.1标准合规**: 完全符合OAuth2.1标准，移除了不安全的隐式流程
- **强制PKCE**: 所有授权码流程都要求PKCE，提升安全性
- **OIDC支持**: 完整实现OpenID Connect协议，支持公钥获取
- **RBAC权限模型**: 基于角色的访问控制，支持细粒度权限管理
- **内网优化**: 专为内网环境优化，简化用户管理流程
- **管理员驱动**: 用户创建、客户端注册、权限分配均由管理员操作

### 1.3 技术栈
- **后端框架**: Next.js 14 (App Router)
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **ORM**: Prisma
- **认证库**: 自研OAuth2.1实现 (基于node-oauth2-server参考)
- **前端**: React 18 + TypeScript
- **UI组件**: shadcn/ui + Tailwind CSS
- **状态管理**: React Query (TanStack Query)
- **部署**: Docker + Kubernetes

## 2. 系统架构设计

### 2.1 整体架构
```
┌─────────────────────────────────────────────────────────────┐
│                    OAuth2.1认证授权中心                      │
├─────────────────────────────────────────────────────────────┤
│  前端层 (Frontend Layer)                                    │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   管理控制台     │  │   用户认证界面   │                  │
│  │  Admin Console  │  │  User Auth UI   │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  API网关层 (API Gateway Layer)                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   管理API v2    │  │   OAuth2.1 API │                  │
│  │  /api/v2/*      │  │   /api/oauth/*  │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  业务逻辑层 (Business Logic Layer)                          │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   权限管理服务   │  │   OAuth2.1服务  │                  │
│  │ Permission Svc  │  │  OAuth2.1 Svc   │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  数据访问层 (Data Access Layer)                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Prisma ORM    │  │   缓存服务       │                  │
│  │                 │  │   Redis Cache   │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  数据存储层 (Data Storage Layer)                            │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   主数据库       │  │   审计日志       │                  │
│  │  PostgreSQL     │  │   Audit Logs    │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 OAuth2.1认证服务
- **授权端点** (`/api/oauth/authorize`): 处理授权请求，支持PKCE
- **令牌端点** (`/api/oauth/token`): 颁发访问令牌和刷新令牌
- **用户信息端点** (`/api/oauth/userinfo`): 提供用户信息 (OIDC)
- **令牌撤销端点** (`/api/oauth/revoke`): 撤销令牌
- **发现端点** (`/.well-known/oauth-authorization-server`): 服务发现

#### 2.2.2 权限管理服务
- **RBAC引擎**: 基于角色的访问控制
- **权限检查**: 统一的权限验证机制
- **动态权限**: 支持上下文相关的权限判断
- **权限缓存**: 高性能权限查询

#### 2.2.3 用户管理服务
- **用户认证**: 多因素认证支持
- **用户生命周期**: 注册、激活、禁用、删除
- **密码策略**: 强密码要求和历史记录
- **账户安全**: 登录尝试限制和账户锁定

## 3. OAuth2.1实现详细设计

### 3.1 支持的授权流程

#### 3.1.1 授权码流程 (Authorization Code Flow)
```mermaid
sequenceDiagram
    participant Client as 客户端应用
    participant Browser as 用户浏览器
    participant AuthServer as 认证服务器
    participant ResourceServer as 资源服务器

    Client->>Browser: 重定向到授权端点
    Note over Client,Browser: 包含client_id, redirect_uri, scope, state, code_challenge, code_challenge_method
    
    Browser->>AuthServer: GET /api/oauth/authorize
    AuthServer->>Browser: 显示登录页面
    Browser->>AuthServer: 用户登录
    AuthServer->>Browser: 显示授权确认页面
    Browser->>AuthServer: 用户确认授权
    
    AuthServer->>Browser: 重定向到客户端
    Note over AuthServer,Browser: 包含authorization_code和state
    
    Browser->>Client: 返回授权码
    Client->>AuthServer: POST /api/oauth/token
    Note over Client,AuthServer: 包含code, client_id, client_secret, code_verifier
    
    AuthServer->>Client: 返回访问令牌
    Note over AuthServer,Client: access_token, refresh_token, id_token (OIDC)
    
    Client->>ResourceServer: 使用访问令牌请求资源
    ResourceServer->>Client: 返回受保护资源
```

#### 3.1.2 客户端凭证流程 (Client Credentials Flow)
```mermaid
sequenceDiagram
    participant Client as 客户端应用
    participant AuthServer as 认证服务器
    participant ResourceServer as 资源服务器

    Client->>AuthServer: POST /api/oauth/token
    Note over Client,AuthServer: grant_type=client_credentials, client_id, client_secret, scope
    
    AuthServer->>AuthServer: 验证客户端凭证
    AuthServer->>Client: 返回访问令牌
    Note over AuthServer,Client: access_token, token_type, expires_in, scope
    
    Client->>ResourceServer: 使用访问令牌请求资源
    ResourceServer->>Client: 返回受保护资源
```

### 3.2 PKCE实现

#### 3.2.1 代码挑战生成
```typescript
// 客户端生成PKCE参数
function generatePKCEParams(): PKCEParams {
  // 生成code_verifier (43-128个字符)
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  
  // 生成code_challenge (SHA256哈希)
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

#### 3.2.2 服务端验证
```typescript
// 授权端点存储code_challenge
async function handleAuthorizeRequest(req: AuthorizeRequest) {
  const { code_challenge, code_challenge_method } = req.query;
  
  // 验证PKCE参数
  if (!code_challenge || code_challenge_method !== 'S256') {
    throw new InvalidRequestError('PKCE required');
  }
  
  // 存储授权码和code_challenge
  const authCode = await saveAuthorizationCode({
    code: generateAuthorizationCode(),
    clientId: req.query.client_id,
    userId: req.user.id,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    // ... 其他参数
  });
  
  return authCode;
}

// 令牌端点验证code_verifier
async function handleTokenRequest(req: TokenRequest) {
  const { code, code_verifier } = req.body;
  
  // 获取授权码记录
  const authCode = await getAuthorizationCode(code);
  
  // 验证PKCE
  const expectedChallenge = base64URLEncode(
    crypto.createHash('sha256').update(code_verifier).digest()
  );
  
  if (authCode.codeChallenge !== expectedChallenge) {
    throw new InvalidGrantError('Invalid code_verifier');
  }
  
  // 颁发令牌
  return await issueTokens(authCode);
}
```

### 3.3 OpenID Connect实现

#### 3.3.1 ID Token结构
```typescript
interface IDTokenPayload {
  // 标准声明
  iss: string;          // 颁发者
  sub: string;          // 主题 (用户ID)
  aud: string | string[]; // 受众 (客户端ID)
  exp: number;          // 过期时间
  iat: number;          // 颁发时间
  auth_time?: number;   // 认证时间
  nonce?: string;       // 随机数
  
  // 用户信息声明
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  
  // 自定义声明
  organization?: string;
  department?: string;
  roles?: string[];
}
```

#### 3.3.2 UserInfo端点实现
```typescript
// /api/oauth/userinfo
export async function GET(request: Request) {
  try {
    // 验证访问令牌
    const token = await validateAccessToken(request);
    
    // 检查scope权限
    if (!token.scope.includes('openid')) {
      throw new InsufficientScopeError('openid scope required');
    }
    
    // 获取用户信息
    const user = await getUserById(token.userId);
    
    // 根据scope返回相应的用户信息
    const userInfo = buildUserInfo(user, token.scope);
    
    return Response.json(userInfo);
  } catch (error) {
    return handleOAuthError(error);
  }
}

function buildUserInfo(user: User, scopes: string[]): UserInfo {
  const userInfo: UserInfo = {
    sub: user.id
  };
  
  if (scopes.includes('profile')) {
    userInfo.name = user.displayName;
    userInfo.given_name = user.firstName;
    userInfo.family_name = user.lastName;
    userInfo.picture = user.avatar;
  }
  
  if (scopes.includes('email')) {
    userInfo.email = user.email;
    userInfo.email_verified = user.emailVerified;
  }
  
  return userInfo;
}
```

## 4. 权限体系设计

### 4.1 RBAC模型

#### 4.1.1 权限层次结构
```
用户 (User)
  ↓ 分配
角色 (Role)
  ↓ 授予
权限 (Permission)
  ↓ 作用于
资源 (Resource)
```

#### 4.1.2 权限类型

**API权限**
- 格式: `{resource}:{action}`
- 示例: `user:create`, `role:list`, `client:delete`
- 映射到具体的HTTP端点和方法

**菜单权限**
- 格式: `menu:{menu_key}:{action}`
- 示例: `menu:dashboard:view`, `menu:users:access`
- 控制前端菜单和页面的显示

**数据权限**
- 格式: `data:{table}:{action}:{condition}`
- 示例: `data:users:read:own_org`, `data:logs:read:all`
- 控制数据访问的范围和条件

### 4.2 权限检查机制

#### 4.2.1 中间件实现
```typescript
// 权限检查中间件
export function requirePermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      const hasPermission = await checkUserPermission(user.id, permission);
      
      if (!hasPermission) {
        return res.status(403).json({
          error: 'insufficient_permissions',
          error_description: `Required permission: ${permission}`
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        error: 'permission_check_failed',
        error_description: 'Failed to verify permissions'
      });
    }
  };
}

// 使用示例
app.get('/api/v2/users', 
  authenticateToken,
  requirePermission('user:list'),
  getUsersHandler
);
```

#### 4.2.2 权限缓存策略
```typescript
// 权限缓存服务
class PermissionCacheService {
  private cache = new Map<string, UserPermissions>();
  private readonly TTL = 5 * 60 * 1000; // 5分钟
  
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const cacheKey = `permissions:${userId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached;
    }
    
    // 从数据库加载权限
    const permissions = await this.loadUserPermissions(userId);
    
    // 缓存权限
    this.cache.set(cacheKey, {
      ...permissions,
      timestamp: Date.now()
    });
    
    return permissions;
  }
  
  invalidateUserPermissions(userId: string): void {
    this.cache.delete(`permissions:${userId}`);
  }
}
```

## 5. API设计

### 5.1 OAuth2.1端点

#### 5.1.1 授权端点
```
GET /api/oauth/authorize

Query Parameters:
- response_type: "code" (required)
- client_id: string (required)
- redirect_uri: string (required)
- scope: string (optional)
- state: string (recommended)
- code_challenge: string (required for PKCE)
- code_challenge_method: "S256" (required for PKCE)
- nonce: string (optional, for OIDC)

Response:
- 302 Redirect to redirect_uri with authorization code
- Error responses follow OAuth2.1 specification
```

#### 5.1.2 令牌端点
```
POST /api/oauth/token

Content-Type: application/x-www-form-urlencoded

Body Parameters:

# Authorization Code Grant
- grant_type: "authorization_code" (required)
- code: string (required)
- redirect_uri: string (required)
- client_id: string (required)
- client_secret: string (required for confidential clients)
- code_verifier: string (required for PKCE)

# Client Credentials Grant
- grant_type: "client_credentials" (required)
- client_id: string (required)
- client_secret: string (required)
- scope: string (optional)

# Refresh Token Grant
- grant_type: "refresh_token" (required)
- refresh_token: string (required)
- client_id: string (required)
- client_secret: string (required for confidential clients)
- scope: string (optional)

Response:
{
  "access_token": "string",
  "token_type": "Bearer",
  "expires_in": number,
  "refresh_token": "string",
  "scope": "string",
  "id_token": "string" // Only for OIDC
}
```

### 5.2 管理API v2

#### 5.2.1 用户管理
```
# 获取用户列表
GET /api/v2/users
Permission: user:list

Query Parameters:
- page: number (default: 1)
- limit: number (default: 20, max: 100)
- search: string (optional)
- organization: string (optional)
- isActive: boolean (optional)

Response:
{
  "data": User[],
  "pagination": {
    "page": number,
    "limit": number,
    "total": number,
    "totalPages": number
  }
}

# 创建用户
POST /api/v2/users
Permission: user:create

Body:
{
  "username": string,
  "email": string,
  "password": string,
  "firstName": string,
  "lastName": string,
  "organization": string,
  "department": string
}

Response:
{
  "id": string,
  "username": string,
  "email": string,
  "firstName": string,
  "lastName": string,
  "organization": string,
  "department": string,
  "isActive": boolean,
  "createdAt": string
}
```

#### 5.2.2 角色管理
```
# 获取角色列表
GET /api/v2/roles
Permission: role:list

# 创建角色
POST /api/v2/roles
Permission: role:create

Body:
{
  "name": string,
  "displayName": string,
  "description": string,
  "permissions": string[]
}

# 分配角色权限
PUT /api/v2/roles/{id}/permissions
Permission: role:update

Body:
{
  "permissions": string[]
}
```

#### 5.2.3 OAuth客户端管理
```
# 获取客户端列表
GET /api/v2/clients
Permission: client:list

# 创建OAuth客户端
POST /api/v2/clients
Permission: client:create

Body:
{
  "clientName": string,
  "clientType": "PUBLIC" | "CONFIDENTIAL",
  "redirectUris": string[],
  "grantTypes": string[],
  "allowedScopes": string[],
  "requirePkce": boolean,
  "requireConsent": boolean
}

Response:
{
  "id": string,
  "clientId": string,
  "clientSecret": string, // Only for confidential clients
  "clientName": string,
  "clientType": string,
  "redirectUris": string[],
  "grantTypes": string[],
  "allowedScopes": string[],
  "requirePkce": boolean,
  "requireConsent": boolean,
  "createdAt": string
}
```

## 6. 安全设计

### 6.1 令牌安全

#### 6.1.1 访问令牌
- **格式**: JWT (JSON Web Token)
- **签名算法**: RS256 (RSA with SHA-256)
- **生命周期**: 1小时 (可配置)
- **存储**: 仅在内存中，不持久化完整令牌
- **撤销**: 通过黑名单机制

#### 6.1.2 刷新令牌
- **格式**: 随机字符串 (256位)
- **存储**: 数据库中存储哈希值
- **生命周期**: 30天 (可配置)
- **轮换**: 每次使用后自动轮换
- **撤销**: 支持显式撤销

#### 6.1.3 授权码
- **格式**: 随机字符串 (128位)
- **生命周期**: 10分钟
- **一次性使用**: 使用后立即失效
- **PKCE绑定**: 与code_challenge绑定

### 6.2 密码安全

#### 6.2.1 密码策略
```typescript
interface PasswordPolicy {
  minLength: number;        // 最小长度 (默认: 8)
  maxLength: number;        // 最大长度 (默认: 128)
  requireUppercase: boolean; // 需要大写字母
  requireLowercase: boolean; // 需要小写字母
  requireNumbers: boolean;   // 需要数字
  requireSpecialChars: boolean; // 需要特殊字符
  forbiddenPasswords: string[]; // 禁用密码列表
  historyCount: number;     // 密码历史记录数量
  expirationDays: number;   // 密码过期天数
}

// 密码验证实现
function validatePassword(password: string, policy: PasswordPolicy): ValidationResult {
  const errors: string[] = [];
  
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }
  
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }
  
  if (policy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain numbers');
  }
  
  if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain special characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

#### 6.2.2 密码哈希
```typescript
// 使用bcrypt进行密码哈希
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

### 6.3 账户安全

#### 6.3.1 登录保护
```typescript
// 登录尝试限制
class LoginSecurityService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟
  
  async checkLoginAttempts(username: string, ipAddress: string): Promise<void> {
    // 检查用户级别的登录尝试
    const userAttempts = await this.getUserFailedAttempts(username);
    if (userAttempts >= this.MAX_ATTEMPTS) {
      const user = await this.getUserByUsername(username);
      if (user && user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AccountLockedError('Account is temporarily locked');
      }
    }
    
    // 检查IP级别的登录尝试
    const ipAttempts = await this.getIPFailedAttempts(ipAddress);
    if (ipAttempts >= this.MAX_ATTEMPTS * 3) {
      throw new IPBlockedError('IP address is temporarily blocked');
    }
  }
  
  async recordLoginAttempt(username: string, ipAddress: string, successful: boolean): Promise<void> {
    await prisma.loginAttempt.create({
      data: {
        username,
        ipAddress,
        successful,
        timestamp: new Date(),
        failureReason: successful ? null : 'INVALID_CREDENTIALS'
      }
    });
    
    if (!successful) {
      await this.handleFailedLogin(username);
    } else {
      await this.handleSuccessfulLogin(username);
    }
  }
}
```

### 6.4 传输安全

#### 6.4.1 HTTPS强制
```typescript
// HTTPS重定向中间件
export function enforceHTTPS(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

// 安全头设置
export function setSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}
```

## 7. 数据库设计优化

### 7.1 索引策略

#### 7.1.1 核心索引
```sql
-- 用户表索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active_org ON users(is_active, organization);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- OAuth客户端索引
CREATE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX idx_oauth_clients_active ON oauth_clients(is_active);
CREATE INDEX idx_oauth_clients_type ON oauth_clients(client_type);

-- 令牌表索引
CREATE INDEX idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX idx_access_tokens_expires ON access_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(is_revoked);

-- 权限相关索引
CREATE INDEX idx_permissions_name ON permissions(name);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);

-- 审计日志索引
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

#### 7.1.2 复合索引
```sql
-- 用户角色查询优化
CREATE INDEX idx_user_roles_composite ON user_roles(user_id, role_id, expires_at);

-- 权限检查优化
CREATE INDEX idx_role_permissions_composite ON role_permissions(role_id, permission_id);

-- 令牌清理优化
CREATE INDEX idx_tokens_cleanup ON access_tokens(expires_at, created_at);
CREATE INDEX idx_refresh_tokens_cleanup ON refresh_tokens(expires_at, is_revoked);

-- 登录尝试查询优化
CREATE INDEX idx_login_attempts_user_time ON login_attempts(username, timestamp);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, timestamp);
```

### 7.2 数据清理策略

#### 7.2.1 过期令牌清理
```typescript
// 定期清理过期令牌
class TokenCleanupService {
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();
    
    // 清理过期的访问令牌
    await prisma.accessToken.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });
    
    // 清理过期的刷新令牌
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { isRevoked: true, revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
        ]
      }
    });
    
    // 清理过期的授权码
    await prisma.authorizationCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { isUsed: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        ]
      }
    });
  }
}

// 定时任务
setInterval(async () => {
  const cleanupService = new TokenCleanupService();
  await cleanupService.cleanupExpiredTokens();
}, 60 * 60 * 1000); // 每小时执行一次
```

#### 7.2.2 审计日志归档
```typescript
// 审计日志归档策略
class AuditLogArchiveService {
  private readonly RETENTION_DAYS = 90; // 保留90天
  
  async archiveOldLogs(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    // 导出到归档存储
    const oldLogs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    });
    
    if (oldLogs.length > 0) {
      // 导出到文件或外部存储
      await this.exportToArchive(oldLogs);
      
      // 删除已归档的日志
      await prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });
    }
  }
}
```

## 8. 性能优化

### 8.1 缓存策略

#### 8.1.1 权限缓存
```typescript
// Redis权限缓存
class PermissionCacheService {
  private redis: Redis;
  private readonly CACHE_TTL = 300; // 5分钟
  
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `permissions:${userId}`;
    
    // 尝试从缓存获取
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // 从数据库加载
    const permissions = await this.loadUserPermissionsFromDB(userId);
    
    // 缓存结果
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(permissions));
    
    return permissions;
  }
  
  async invalidateUserPermissions(userId: string): Promise<void> {
    await this.redis.del(`permissions:${userId}`);
  }
  
  async invalidateRolePermissions(roleId: string): Promise<void> {
    // 获取拥有该角色的所有用户
    const users = await prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true }
    });
    
    // 批量清除用户权限缓存
    const pipeline = this.redis.pipeline();
    users.forEach(user => {
      pipeline.del(`permissions:${user.userId}`);
    });
    await pipeline.exec();
  }
}
```

#### 8.1.2 客户端信息缓存
```typescript
// OAuth客户端缓存
class ClientCacheService {
  private cache = new Map<string, OAuthClient>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10分钟
  
  async getClient(clientId: string): Promise<OAuthClient | null> {
    const cached = this.cache.get(clientId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      return cached;
    }
    
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId, isActive: true }
    });
    
    if (client) {
      this.cache.set(clientId, {
        ...client,
        cachedAt: Date.now()
      });
    }
    
    return client;
  }
  
  invalidateClient(clientId: string): void {
    this.cache.delete(clientId);
  }
}
```

### 8.2 数据库优化

#### 8.2.1 连接池配置
```typescript
// Prisma连接池优化
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// 连接池配置 (在DATABASE_URL中)
// postgresql://user:password@localhost:5432/db?connection_limit=20&pool_timeout=20
```

#### 8.2.2 查询优化
```typescript
// 批量权限检查
async function checkMultiplePermissions(userId: string, permissions: string[]): Promise<Record<string, boolean>> {
  // 一次查询获取用户所有权限
  const userPermissions = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      }
    }
  });
  
  // 构建权限集合
  const userPermissionSet = new Set<string>();
  userPermissions?.userRoles.forEach(userRole => {
    userRole.role.rolePermissions.forEach(rolePermission => {
      userPermissionSet.add(rolePermission.permission.name);
    });
  });
  
  // 检查每个权限
  const result: Record<string, boolean> = {};
  permissions.forEach(permission => {
    result[permission] = userPermissionSet.has(permission);
  });
  
  return result;
}
```

## 9. 监控和日志

### 9.1 审计日志

#### 9.1.1 日志记录策略
```typescript
// 审计日志服务
class AuditLogService {
  async logUserAction(params: {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    status: 'SUCCESS' | 'FAILURE' | 'PENDING';
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        actorType: 'USER',
        actorId: params.userId || 'anonymous',
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details ? JSON.stringify(params.details) : null,
        status: params.status,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        timestamp: new Date()
      }
    });
  }
  
  async logSystemAction(params: {
    action: string;
    details?: any;
    status: 'SUCCESS' | 'FAILURE';
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorId: 'system',
        action: params.action,
        details: params.details ? JSON.stringify(params.details) : null,
        status: params.status,
        timestamp: new Date()
      }
    });
  }
}
```

#### 9.1.2 关键事件记录
```typescript
// 关键事件审计
const AUDIT_EVENTS = {
  // 认证事件
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  
  // OAuth事件
  OAUTH_AUTHORIZE: 'OAUTH_AUTHORIZE',
  OAUTH_TOKEN_ISSUED: 'OAUTH_TOKEN_ISSUED',
  OAUTH_TOKEN_REVOKED: 'OAUTH_TOKEN_REVOKED',
  
  // 用户管理事件
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ROLE_ASSIGNED: 'USER_ROLE_ASSIGNED',
  USER_ROLE_REVOKED: 'USER_ROLE_REVOKED',
  
  // 权限事件
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  
  // 客户端事件
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_DELETED: 'CLIENT_DELETED'
};

// 使用示例
app.post('/api/v2/users', async (req, res) => {
  try {
    const user = await createUser(req.body);
    
    // 记录审计日志
    await auditLogService.logUserAction({
      userId: req.user.id,
      action: AUDIT_EVENTS.USER_CREATED,
      resourceType: 'User',
      resourceId: user.id,
      details: { username: user.username, email: user.email },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      status: 'SUCCESS'
    });
    
    res.json(user);
  } catch (error) {
    // 记录失败日志
    await auditLogService.logUserAction({
      userId: req.user.id,
      action: AUDIT_EVENTS.USER_CREATED,
      details: { error: error.message, requestBody: req.body },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      status: 'FAILURE'
    });
    
    throw error;
  }
});
```

### 9.2 性能监控

#### 9.2.1 API响应时间监控
```typescript
// 性能监控中间件
export function performanceMonitoring(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    
    // 记录性能指标
    console.log({
      method: req.method,
      route,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // 慢查询告警
    if (duration > 1000) {
      console.warn(`Slow API detected: ${req.method} ${route} took ${duration}ms`);
    }
  });
  
  next();
}
```

#### 9.2.2 数据库查询监控
```typescript
// Prisma查询监控
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    console.warn(`Slow query detected: ${e.query} took ${e.duration}ms`);
  }
});
```

## 10. 部署和运维

### 10.1 Docker配置

#### 10.1.1 Dockerfile
```dockerfile
# 多阶段构建
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
COPY pnpm-lock.yaml ./

# 安装依赖
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 生成Prisma客户端
RUN pnpm prisma generate

# 构建应用
RUN pnpm build

# 生产镜像
FROM node:18-alpine AS runner

WORKDIR /app

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制Prisma相关文件
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 10.1.2 Docker Compose
```yaml
version: '3.8'

services:
  auth-center:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://auth_user:auth_pass@postgres:5432/auth_center
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY}
      - JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=auth_center
      - POSTGRES_USER=auth_user
      - POSTGRES_PASSWORD=auth_pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auth_user -d auth_center"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

### 10.2 Kubernetes部署

#### 10.2.1 Deployment配置
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-center
  namespace: auth-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-center
  template:
    metadata:
      labels:
        app: auth-center
    spec:
      containers:
      - name: auth-center
        image: auth-center:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-center-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-center-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### 10.2.2 Service和Ingress
```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-center-service
  namespace: auth-system
spec:
  selector:
    app: auth-center
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: auth-center-ingress
  namespace: auth-system
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - auth.example.com
    secretName: auth-center-tls
  rules:
  - host: auth.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: auth-center-service
            port:
              number: 80
```

### 10.3 环境配置

#### 10.3.1 环境变量
```bash
# 基础配置
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/auth_center

# Redis配置
REDIS_URL=redis://localhost:6379

# JWT配置
JWT_SECRET=your-jwt-secret-key
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_ALGORITHM=RS256
JWT_ISSUER=https://auth.example.com
JWT_AUDIENCE=https://api.example.com

# OAuth配置
OAUTH_AUTHORIZATION_CODE_LIFETIME=600  # 10分钟
OAUTH_ACCESS_TOKEN_LIFETIME=3600       # 1小时
OAUTH_REFRESH_TOKEN_LIFETIME=2592000   # 30天

# 安全配置
PASSWORD_SALT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=900  # 15分钟

# 邮件配置
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=smtp-password
SMTP_FROM=OAuth Center <noreply@example.com>

# 监控配置
LOG_LEVEL=info
ENABLE_AUDIT_LOG=true
AUDIT_LOG_RETENTION_DAYS=90
```

## 11. 测试策略

### 11.1 单元测试

#### 11.1.1 OAuth2.1流程测试
```typescript
// OAuth授权码流程测试
describe('OAuth2.1 Authorization Code Flow', () => {
  it('should generate authorization code with PKCE', async () => {
    const client = await createTestClient({
      clientType: 'PUBLIC',
      requirePkce: true
    });
    
    const user = await createTestUser();
    const { codeChallenge, codeVerifier } = generatePKCEParams();
    
    // 请求授权码
    const authRequest = {
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: client.redirectUris[0],
      scope: 'openid profile',
      state: 'random-state',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    };
    
    const authCode = await oauthService.authorize(authRequest, user);
    
    expect(authCode).toBeDefined();
    expect(authCode.codeChallenge).toBe(codeChallenge);
    expect(authCode.codeChallengeMethod).toBe('S256');
  });
  
  it('should exchange authorization code for tokens', async () => {
    const { authCode, codeVerifier } = await setupAuthorizationCode();
    
    const tokenRequest = {
      grant_type: 'authorization_code',
      code: authCode.code,
      redirect_uri: authCode.redirectUri,
      client_id: authCode.client.clientId,
      code_verifier: codeVerifier
    };
    
    const tokens = await oauthService.token(tokenRequest);
    
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);
  });
});
```

#### 11.1.2 权限系统测试
```typescript
// RBAC权限测试
describe('RBAC Permission System', () => {
  it('should check user permissions correctly', async () => {
    const user = await createTestUser();
    const role = await createTestRole({
      name: 'USER_ADMIN',
      permissions: ['user:create', 'user:read', 'user:update']
    });
    
    await assignRoleToUser(user.id, role.id);
    
    const hasCreatePermission = await permissionService.checkPermission(
      user.id, 
      'user:create'
    );
    const hasDeletePermission = await permissionService.checkPermission(
      user.id, 
      'user:delete'
    );
    
    expect(hasCreatePermission).toBe(true);
    expect(hasDeletePermission).toBe(false);
  });
  
  it('should handle role expiration', async () => {
    const user = await createTestUser();
    const role = await createTestRole();
    
    // 分配过期角色
    await assignRoleToUser(user.id, role.id, {
      expiresAt: new Date(Date.now() - 1000) // 1秒前过期
    });
    
    const hasPermission = await permissionService.checkPermission(
      user.id, 
      'user:create'
    );
    
    expect(hasPermission).toBe(false);
  });
});
```

### 11.2 集成测试

#### 11.2.1 API端点测试
```typescript
// API集成测试
describe('API Integration Tests', () => {
  it('should create user with proper authentication', async () => {
    const adminToken = await getAdminAccessToken();
    
    const response = await request(app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User'
      })
      .expect(201);
    
    expect(response.body.username).toBe('testuser');
    expect(response.body.email).toBe('test@example.com');
    expect(response.body.passwordHash).toBeUndefined(); // 不应返回密码
  });
  
  it('should reject unauthorized requests', async () => {
    await request(app)
      .post('/api/v2/users')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123!'
      })
      .expect(401);
  });
  
  it('should validate input data', async () => {
    const adminToken = await getAdminAccessToken();
    
    await request(app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'a', // 太短
        email: 'invalid-email', // 无效邮箱
        password: '123' // 密码太弱
      })
      .expect(400);
  });
});
```

#### 11.2.2 OAuth流程集成测试
```typescript
// OAuth完整流程测试
describe('OAuth2.1 Full Flow Integration', () => {
  it('should complete authorization code flow with PKCE', async () => {
    const client = await createTestClient();
    const user = await createTestUser();
    const { codeChallenge, codeVerifier } = generatePKCEParams();
    
    // 1. 授权请求
    const authorizeResponse = await request(app)
      .get('/api/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: client.clientId,
        redirect_uri: client.redirectUris[0],
        scope: 'openid profile email',
        state: 'test-state',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      })
      .set('Cookie', await getUserSessionCookie(user))
      .expect(302);
    
    // 2. 提取授权码
    const redirectUrl = new URL(authorizeResponse.headers.location);
    const authCode = redirectUrl.searchParams.get('code');
    const state = redirectUrl.searchParams.get('state');
    
    expect(authCode).toBeDefined();
    expect(state).toBe('test-state');
    
    // 3. 交换令牌
    const tokenResponse = await request(app)
      .post('/api/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: client.redirectUris[0],
        client_id: client.clientId,
        code_verifier: codeVerifier
      })
      .expect(200);
    
    expect(tokenResponse.body.access_token).toBeDefined();
    expect(tokenResponse.body.refresh_token).toBeDefined();
    expect(tokenResponse.body.id_token).toBeDefined();
    
    // 4. 使用访问令牌获取用户信息
    const userinfoResponse = await request(app)
      .get('/api/oauth/userinfo')
      .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
      .expect(200);
    
    expect(userinfoResponse.body.sub).toBe(user.id);
    expect(userinfoResponse.body.email).toBe(user.email);
  });
});
```

### 11.3 性能测试

#### 11.3.1 负载测试
```typescript
// 性能测试配置
describe('Performance Tests', () => {
  it('should handle concurrent token requests', async () => {
    const client = await createTestClient();
    const promises = [];
    
    // 并发100个客户端凭证请求
    for (let i = 0; i < 100; i++) {
      promises.push(
        request(app)
          .post('/api/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            scope: 'api:read'
          })
      );
    }
    
    const startTime = Date.now();
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    
    // 所有请求都应该成功
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.access_token).toBeDefined();
    });
    
    // 性能要求：100个并发请求在5秒内完成
    expect(endTime - startTime).toBeLessThan(5000);
  });
  
  it('should handle permission checks efficiently', async () => {
    const user = await createTestUserWithManyRoles(10); // 10个角色
    
    const startTime = Date.now();
    
    // 检查100个不同权限
    const permissions = Array.from({ length: 100 }, (_, i) => `resource${i}:read`);
    const results = await permissionService.checkMultiplePermissions(user.id, permissions);
    
    const endTime = Date.now();
    
    expect(Object.keys(results)).toHaveLength(100);
    // 权限检查应该在100ms内完成
    expect(endTime - startTime).toBeLessThan(100);
  });
});
```

## 12. 安全配置清单

### 12.1 生产环境安全检查

#### 12.1.1 必要的安全配置
```bash
# 1. HTTPS配置
✓ 强制HTTPS重定向
✓ HSTS头设置
✓ 有效的SSL证书
✓ TLS 1.2+版本

# 2. 密钥管理
✓ 强随机JWT密钥
✓ RSA密钥对（2048位+）
✓ 定期密钥轮换
✓ 密钥安全存储

# 3. 数据库安全
✓ 数据库连接加密
✓ 最小权限原则
✓ 定期备份
✓ 访问日志记录

# 4. 应用安全
✓ 输入验证
✓ SQL注入防护
✓ XSS防护
✓ CSRF防护
✓ 速率限制

# 5. 监控和日志
✓ 审计日志记录
✓ 异常监控
✓ 性能监控
✓ 安全事件告警
```

#### 12.1.2 安全头配置
```typescript
// 安全头中间件
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // HSTS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // 内容类型嗅探保护
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 点击劫持保护
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS保护
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 引用策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 内容安全策略
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  
  // 权限策略
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()'
  ].join(', '));
  
  next();
}
```

### 12.2 安全最佳实践

#### 12.2.1 密码安全
```typescript
// 密码安全配置
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  forbiddenPasswords: [
    'password', '123456', 'qwerty', 'admin',
    'password123', '12345678', 'welcome'
  ],
  historyCount: 5, // 记住最近5个密码
  expirationDays: 90, // 90天过期
  maxAge: 365 * 24 * 60 * 60 * 1000 // 1年最大年龄
};

// 密码强度检查
function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];
  
  // 长度检查
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else feedback.push('密码长度至少8位');
  
  // 字符类型检查
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('需要包含大写字母');
  
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('需要包含小写字母');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('需要包含数字');
  
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('需要包含特殊字符');
  
  // 复杂度检查
  if (!/(..).*\1/.test(password)) score += 1; // 无重复子串
  if (!/012|123|234|345|456|567|678|789|890|abc|bcd|cde/.test(password.toLowerCase())) {
    score += 1; // 无连续字符
  }
  
  return { score, feedback };
}
```

#### 12.2.2 会话安全
```typescript
// 会话安全配置
const SESSION_CONFIG = {
  name: 'auth_session',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // 每次请求都刷新过期时间
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 生产环境强制HTTPS
    httpOnly: true, // 防止XSS
    maxAge: 30 * 60 * 1000, // 30分钟
    sameSite: 'strict' as const // CSRF保护
  },
  store: new RedisStore({
    client: redisClient,
    prefix: 'sess:',
    ttl: 30 * 60 // 30分钟
  })
};
```

## 13. 附录

### 13.1 OAuth2.1与OAuth2.0的主要差异

| 特性 | OAuth2.0 | OAuth2.1 |
|------|----------|----------|
| 隐式流程 | 支持 | **移除** |
| 资源所有者密码凭证流程 | 支持 | **移除** |
| PKCE | 可选 | **强制要求** |
| 刷新令牌轮换 | 可选 | **推荐** |
| 重定向URI匹配 | 精确匹配 | **更严格的验证** |
| 安全性 | 基础 | **增强** |

### 13.2 支持的OAuth2.1 Scope

| Scope | 描述 | 返回的用户信息 |
|-------|------|----------------|
| `openid` | OpenID Connect标识符 | `sub` |
| `profile` | 基本用户资料 | `name`, `given_name`, `family_name`, `picture` |
| `email` | 邮箱信息 | `email`, `email_verified` |
| `phone` | 电话信息 | `phone_number`, `phone_number_verified` |
| `address` | 地址信息 | `address` |
| `api:read` | API读取权限 | - |
| `api:write` | API写入权限 | - |
| `admin` | 管理员权限 | - |

### 13.3 错误代码参考

#### 13.3.1 OAuth2.1错误代码
```typescript
// OAuth2.1标准错误代码
export const OAUTH_ERRORS = {
  // 授权端点错误
  INVALID_REQUEST: 'invalid_request',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  INVALID_SCOPE: 'invalid_scope',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  
  // 令牌端点错误
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  
  // 资源服务器错误
  INVALID_TOKEN: 'invalid_token',
  INSUFFICIENT_SCOPE: 'insufficient_scope'
};
```

#### 13.3.2 自定义错误代码
```typescript
// 系统自定义错误代码
export const CUSTOM_ERRORS = {
  // 认证错误
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_DISABLED: 'account_disabled',
  PASSWORD_EXPIRED: 'password_expired',
  MFA_REQUIRED: 'mfa_required',
  
  // 权限错误
  INSUFFICIENT_PERMISSIONS: 'insufficient_permissions',
  ROLE_NOT_FOUND: 'role_not_found',
  PERMISSION_DENIED: 'permission_denied',
  
  // 业务错误
  USER_NOT_FOUND: 'user_not_found',
  CLIENT_NOT_FOUND: 'client_not_found',
  DUPLICATE_USERNAME: 'duplicate_username',
  DUPLICATE_EMAIL: 'duplicate_email',
  
  // 系统错误
  DATABASE_ERROR: 'database_error',
  CACHE_ERROR: 'cache_error',
  EXTERNAL_SERVICE_ERROR: 'external_service_error'
};
```

### 13.4 性能基准

#### 13.4.1 响应时间要求
| 操作 | 目标响应时间 | 最大响应时间 |
|------|--------------|-------------|
| 用户登录 | < 200ms | < 500ms |
| 令牌颁发 | < 100ms | < 300ms |
| 权限检查 | < 50ms | < 100ms |
| 用户信息查询 | < 100ms | < 200ms |
| 管理API调用 | < 300ms | < 1000ms |

#### 13.4.2 并发处理能力
| 场景 | 目标QPS | 最大QPS |
|------|---------|--------|
| 令牌验证 | 1000 | 2000 |
| 用户认证 | 100 | 200 |
| 权限检查 | 500 | 1000 |
| 管理操作 | 50 | 100 |

### 13.5 部署清单

#### 13.5.1 生产环境部署检查
```bash
# 环境配置
□ 生产环境变量配置完成
□ 数据库连接配置正确
□ Redis缓存配置正确
□ HTTPS证书配置完成
□ 域名DNS配置正确

# 安全配置
□ JWT密钥已生成并安全存储
□ 数据库密码已设置并加密存储
□ 防火墙规则已配置
□ 安全头已启用
□ 日志记录已启用

# 性能配置
□ 数据库连接池已优化
□ Redis缓存已配置
□ CDN已配置（如需要）
□ 负载均衡已配置（如需要）
□ 监控系统已部署

# 备份和恢复
□ 数据库备份策略已制定
□ 配置文件备份已完成
□ 恢复流程已测试
□ 灾难恢复计划已制定
```

### 13.6 维护指南

#### 13.6.1 日常维护任务
```bash
# 每日任务
- 检查系统日志
- 监控系统性能
- 检查备份状态
- 审查安全告警

# 每周任务
- 清理过期令牌
- 分析性能报告
- 检查磁盘空间
- 更新安全补丁

# 每月任务
- 审计用户权限
- 分析访问日志
- 检查证书过期
- 性能优化评估

# 每季度任务
- 安全评估
- 灾难恢复演练
- 容量规划评估
- 架构优化评估
```

---

## 结语

本技术设计文档详细描述了OAuth2.1认证授权中心的完整技术实现方案。该系统严格遵循OAuth2.1标准，实现了现代化的认证授权服务，具备高安全性、高性能和高可扩展性的特点。

通过本文档的指导，开发团队可以构建一个企业级的认证授权中心，为组织内的各种应用和服务提供统一、安全的身份认证和授权管理服务。

**文档版本**: v1.0  
**最后更新**: 2024年12月  
**维护团队**: 认证授权中心开发团队})