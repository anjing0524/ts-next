# OAuth2.1 + RBAC + ABAC 认证授权中心技术设计文档

## 项目定位

本系统是专为**企业内网环境**设计的OAuth2.1认证授权中心，作为企业应用生态的核心基础设施。系统安全边界由企业网络保障，专注于内网环境下的高效认证和精细化权限控制，支持多种认证场景：

- **第三方页面API认证**：为企业内部Web应用提供统一的OAuth2.1认证服务
- **服务间认证**：支持微服务架构下的Service-to-Service认证
- **API服务器认证**：为API网关和服务提供JWT令牌验证
- **第三方客户端认证**：支持企业内部开发的各类客户端应用接入

## 1. 系统架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Web应用    │  │   移动应用   │  │   第三方应用  │        │
│  │  (Next.js)   │  │ (React Native)│  │  (任意技术栈) │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                         │ OAuth2.1 + API调用
┌─────────────────────────────────────────────────────────────────┐
│                      API网关层                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ 负载均衡器   │  │  API网关     │  │ 权限中间件   │           │
│  │ (Nginx)     │  │ (Optional)   │  │ (Built-in)  │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                         │ HTTP/HTTPS (内网TLS)
┌─────────────────────────────────────────────────────────────────┐
│                     认证授权服务层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ OAuth2.1    │  │ RBAC权限    │  │ ABAC策略    │           │
│  │ 认证服务     │  │ 管理服务     │  │ 引擎服务     │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
│                         │                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ 用户管理    │  │ 服务间认证   │  │ 审计服务     │           │
│  │ 服务        │  │ 服务        │  │             │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                         │ 数据访问
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ MySQL       │  │ Redis       │  │ 文件存储     │           │
│  │ (主数据库)   │  │ (缓存)      │  │ (日志/配置)   │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 多认证场景支持

#### 1.2.1 第三方页面API认证

- **场景**：企业内部Web应用需要OAuth2.1认证
- **流程**：标准授权码流程 + PKCE
- **特点**：用户友好的授权页面，支持SSO单点登录

#### 1.2.2 服务间认证 (Service-to-Service)

- **场景**：微服务之间的API调用认证
- **流程**：Client Credentials Grant
- **特点**：无用户上下文，基于服务身份和权限

#### 1.2.3 API服务器认证

- **场景**：API网关验证请求令牌
- **流程**：JWT令牌验证 + 权限检查
- **特点**：高性能验证，支持缓存和批量验证

#### 1.2.4 第三方客户端认证

- **场景**：企业内部开发的客户端应用
- **流程**：支持多种Grant类型
- **特点**：灵活的客户端配置，适应不同应用类型

### 1.3 服务模块设计

#### 1.3.1 认证服务 (Authentication Service)

**职责**: OAuth2.1标准认证流程实现

- 用户身份验证 (用户名/密码)
- 授权码生成和验证 (PKCE支持)
- 访问令牌和刷新令牌管理
- 客户端身份验证

**核心API**:

```typescript
interface AuthenticationService {
  // OAuth2.1 端点
  authorize(params: AuthorizeParams): Promise<AuthorizeResult>;
  token(params: TokenParams): Promise<TokenResult>;
  userinfo(token: string): Promise<UserInfo>;
  revoke(params: RevokeParams): Promise<void>;

  // 用户认证
  login(credentials: LoginCredentials): Promise<LoginResult>;
  logout(sessionId: string): Promise<void>;
  validateSession(sessionId: string): Promise<SessionInfo>;
}
```

#### 1.3.2 权限服务 (Authorization Service)

**职责**: RBAC+ABAC权限验证和管理

- 权限检查和决策
- 角色权限管理
- 策略规则评估
- 权限缓存管理

**核心API**:

```typescript
interface AuthorizationService {
  // 权限验证
  checkPermission(request: PermissionRequest): Promise<PermissionResult>;
  getUserPermissions(userId: string): Promise<Permission[]>;

  // RBAC管理
  assignRole(userId: string, roleId: string): Promise<void>;
  revokeRole(userId: string, roleId: string): Promise<void>;

  // ABAC基础策略
  evaluateBasicPolicy(context: BasicPolicyContext): Promise<PolicyResult>;
  createBasicPolicy(policy: BasicPolicyRule): Promise<string>;
}
```

#### 1.3.3 服务间认证服务 (Service-to-Service Authentication)

**职责**: 微服务间的身份认证和授权

- 服务身份验证和注册
- Client Credentials Grant流程
- 服务权限管理
- 服务调用审计

**核心API**:

```typescript
interface ServiceAuthService {
  // 服务认证
  authenticateService(clientId: string, clientSecret: string): Promise<ServiceToken>;
  validateServiceToken(token: string): Promise<ServiceInfo>;

  // 服务管理
  registerService(service: ServiceRegistration): Promise<ServiceCredentials>;
  updateServicePermissions(serviceId: string, permissions: string[]): Promise<void>;

  // 服务调用验证
  checkServicePermission(serviceId: string, permission: string): Promise<boolean>;
}
```

#### 1.3.4 用户管理服务 (User Management Service)

**职责**: 用户生命周期管理

- 用户CRUD操作
- 密码策略管理（内网简化版）
- 用户属性管理
- 账户状态控制

---

## 2. 数据模型设计

### 2.1 核心实体关系图

```
User ||--o{ UserRole : has
Role ||--o{ RolePermission : contains
Permission ||--o{ RolePermission : belongs_to

User ||--o{ UserAttribute : has
User ||--o{ AccessToken : owns
User ||--o{ AuthorizationCode : grants

OAuthClient ||--o{ AccessToken : issues
OAuthClient ||--o{ AuthorizationCode : generates

Resource ||--o{ ResourceAttribute : has
Policy ||--o{ PolicyEvaluation : triggers
```

### 2.2 权限模型详细设计

#### 2.2.1 权限标识符设计

```typescript
interface PermissionIdentifier {
  category: 'system' | 'app' | 'api' | 'data' | 'page';
  resource: string; // 资源标识
  action: string; // 操作类型
}

// 标准权限示例
const PERMISSIONS = {
  // 系统管理权限
  SYSTEM_USER_CREATE: 'system:user:create',
  SYSTEM_ROLE_ASSIGN: 'system:role:assign',
  SYSTEM_CLIENT_MANAGE: 'system:client:manage',

  // 应用访问权限
  APP_OA_ACCESS: 'app:oa:access',
  APP_CRM_ADMIN: 'app:crm:admin',

  // API接口权限
  API_USER_READ: 'api:user:read',
  API_USER_WRITE: 'api:user:write',

  // 数据操作权限
  DATA_DOCUMENT_READ: 'data:document:read',
  DATA_FINANCE_APPROVE: 'data:finance:approve',

  // 页面访问权限
  PAGE_ADMIN_ACCESS: 'page:admin:access',
  PAGE_REPORT_VIEW: 'page:report:view',
};
```

#### 2.2.2 ABAC基础策略语法设计

```typescript
interface BasicPolicyRule {
  name: string;
  description?: string;
  rule: string; // 基于基本属性的JavaScript表达式
  effect: 'ALLOW' | 'DENY';
  priority: number; // 数值越大优先级越高
  isActive: boolean;
}

// 基础策略上下文结构
interface BasicPolicyContext {
  user: {
    id: string;
    department: string; // 部门
    position: string; // 岗位
    organization: string; // 单位
    workLocation: string; // 工作地点
  };
  resource?: {
    id: string;
    owner?: string;
    department?: string;
    organization?: string;
  };
  environment: {
    sourceIP: string; // 来源IP
    accessTime: Date; // 访问时间
    workingHours: boolean; // 是否工作时间
    location: string; // 地理位置
  };
  action: string;
}

// 基础策略示例
const BASIC_POLICY_EXAMPLES = [
  {
    name: 'department_isolation',
    rule: 'user.department === resource.department',
    effect: 'ALLOW',
    priority: 100,
  },
  {
    name: 'working_hours_only',
    rule: 'environment.workingHours === true',
    effect: 'ALLOW',
    priority: 200,
  },
  {
    name: 'office_ip_restriction',
    rule: 'environment.sourceIP.startsWith("192.168.") || environment.sourceIP.startsWith("10.0.")',
    effect: 'ALLOW',
    priority: 300,
  },
  {
    name: 'manager_access',
    rule: 'user.position === "经理" || user.position === "主管"',
    effect: 'ALLOW',
    priority: 400,
  },
  {
    name: 'headquarters_bypass',
    rule: 'user.organization === "总部"',
    effect: 'ALLOW',
    priority: 500,
  },
];
```

---

## 3. API接口设计

### 3.1 OAuth2.1标准端点

#### 3.1.1 授权端点

```http
GET /oauth/authorize
Parameters:
  - response_type: "code" (必需)
  - client_id: string (必需)
  - redirect_uri: string (必需)
  - scope: string[] (可选)
  - state: string (推荐)
  - code_challenge: string (必需, PKCE)
  - code_challenge_method: "S256" (必需, PKCE)

Success Response (302 Redirect):
Location: {redirect_uri}?code={authorization_code}&state={state}

Error Response (302 Redirect):
Location: {redirect_uri}?error={error_code}&error_description={description}&state={state}
```

#### 3.1.2 令牌端点

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

Request Body:
  - grant_type: "authorization_code" (必需)
  - code: string (必需)
  - client_id: string (必需)
  - redirect_uri: string (必需)
  - code_verifier: string (必需, PKCE)
  - client_secret: string (机密客户端必需)

Success Response (200):
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def502003ca4f66ee...",
  "scope": ["user:read", "user:write"]
}

Error Response (400):
{
  "error": "invalid_grant",
  "error_description": "The provided authorization grant is invalid"
}
```

#### 3.1.3 用户信息端点

```http
GET /oauth/userinfo
Authorization: Bearer {access_token}

Success Response (200):
{
  "sub": "user123",
  "name": "张三",
  "username": "zhangsan",
  "department": "技术部",
  "position": "高级工程师",
  "organization": "总部",
  "clearance_level": 3
}
```

### 3.2 权限管理API

#### 3.2.1 权限验证API

```http
POST /api/permissions/check
Authorization: Bearer {access_token}
Content-Type: application/json

Request Body:
{
  "permission": "data:document:read",
  "resourceId": "doc123",
  "context": {
    "department": "技术部",
    "sensitivity": "internal"
  }
}

Success Response (200):
{
  "allowed": true,
  "reason": "RBAC_ALLOWED",
  "decision_id": "req_123456",
  "ttl": 900,
  "details": {
    "oauth_validation": {
      "valid": true,
      "scope_check": true
    },
    "rbac_result": {
      "allowed": true,
      "matched_roles": ["employee", "tech_staff"]
    },
    "abac_result": {
      "allowed": false,
      "evaluated_policies": ["department_isolation"]
    },
    "execution_time_ms": 45
  }
}
```

#### 3.2.2 用户权限查询API

```http
GET /api/users/{userId}/permissions
Authorization: Bearer {access_token}

Query Parameters:
  - include_roles: boolean (是否包含角色信息)
  - permission_filter: string (权限过滤器)

Success Response (200):
{
  "user_id": "user123",
  "permissions": [
    {
      "identifier": "api:user:read",
      "name": "用户信息读取",
      "source": "role",
      "source_detail": "employee"
    },
    {
      "identifier": "data:document:read",
      "name": "文档读取",
      "source": "direct",
      "source_detail": "direct_assignment"
    }
  ],
  "roles": [
    {
      "id": "role123",
      "name": "employee",
      "display_name": "普通员工"
    }
  ],
  "cached_until": "2024-01-20T10:30:00Z"
}
```

### 3.3 管理API

#### 3.3.1 客户端管理API

```http
POST /api/admin/clients
Authorization: Bearer {admin_token}
Content-Type: application/json

Request Body:
{
  "name": "OA系统",
  "description": "企业办公自动化系统",
  "client_type": "confidential",
  "redirect_uris": ["https://oa.company.com/auth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "scopes": ["user:read", "user:write"]
}

Success Response (201):
{
  "client_id": "oa_system_client",
  "client_secret": "secret_abc123...",
  "name": "OA系统",
  "redirect_uris": ["https://oa.company.com/auth/callback"],
  "created_at": "2024-01-20T09:00:00Z"
}
```

#### 3.3.2 角色管理API

```http
POST /api/admin/roles
Authorization: Bearer {admin_token}
Content-Type: application/json

Request Body:
{
  "name": "project_manager",
  "display_name": "项目经理",
  "description": "负责项目管理和团队协调",
  "parent_id": "employee",
  "permissions": [
    "data:project:read",
    "data:project:write",
    "api:team:manage"
  ]
}

Success Response (201):
{
  "id": "role456",
  "name": "project_manager",
  "display_name": "项目经理",
  "effective_permissions": [
    "data:project:read",
    "data:project:write",
    "api:team:manage",
    "api:user:read"  // 继承自parent
  ],
  "created_at": "2024-01-20T09:00:00Z"
}
```

---

## 4. 安全设计

### 4.1 OAuth2.1安全实现

#### 4.1.1 PKCE实现

```typescript
// 客户端PKCE参数生成
function generatePKCEParams(): PKCEParams {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = base64url(sha256(codeVerifier));

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// 服务端PKCE验证
function validatePKCE(challenge: string, verifier: string): boolean {
  const expectedChallenge = base64url(sha256(verifier));
  return timingSafeEqual(challenge, expectedChallenge);
}
```

#### 4.1.2 JWT令牌安全

```typescript
interface JWTPayload {
  // 标准声明
  iss: string; // 颁发者
  sub: string; // 用户ID
  aud: string; // 客户端ID
  exp: number; // 过期时间
  iat: number; // 颁发时间
  jti: string; // 令牌ID

  // 自定义声明
  scope: string[]; // 授权范围
  roles: string[]; // 用户角色
  department: string; // 部门
  position: string; // 岗位
}

// 令牌签名和验证
class JWTService {
  async signToken(payload: JWTPayload): Promise<string> {
    return await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.privateKey);
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    const { payload } = await jose.jwtVerify(token, this.publicKey);
    return payload as JWTPayload;
  }
}
```

### 4.2 权限验证安全

#### 4.2.1 权限检查流程

```typescript
class PermissionValidator {
  async checkPermission(request: PermissionRequest): Promise<PermissionResult> {
    try {
      // 1. OAuth令牌验证
      const tokenInfo = await this.validateAccessToken(request.token);
      if (!tokenInfo.valid) {
        return { allowed: false, reason: 'INVALID_TOKEN' };
      }

      // 2. 作用域检查
      if (!this.checkScope(tokenInfo.scope, request.permission)) {
        return { allowed: false, reason: 'INSUFFICIENT_SCOPE' };
      }

      // 3. RBAC权限检查
      const rbacResult = await this.checkRBACPermission(tokenInfo.userId, request.permission);

      // 4. ABAC基础策略评估
      const abacResult = await this.evaluateBasicABACPolicies(
        tokenInfo.userId,
        request.permission,
        request.context
      );

      // 5. 决策融合
      const allowed = rbacResult.allowed || abacResult.allowed;

      // 6. 审计日志
      await this.logPermissionCheck({
        userId: tokenInfo.userId,
        permission: request.permission,
        result: allowed,
        reason: allowed ? (rbacResult.allowed ? 'RBAC' : 'ABAC') : 'DENIED',
      });

      return {
        allowed,
        reason: allowed ? (rbacResult.allowed ? 'RBAC_ALLOWED' : 'ABAC_ALLOWED') : 'DENIED',
        decisionId: generateId(),
        ttl: 900,
        details: { rbacResult, abacResult },
      };
    } catch (error) {
      await this.logError(error);
      return { allowed: false, reason: 'SYSTEM_ERROR' };
    }
  }
}
```

### 4.3 数据安全保护

#### 4.3.1 敏感数据加密

```typescript
class DataProtection {
  // 密码哈希
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  // 敏感字段加密
  async encryptSensitiveData(data: string): Promise<string> {
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return encrypted + ':' + authTag.toString('hex');
  }

  async decryptSensitiveData(encryptedData: string): Promise<string> {
    const [encrypted, authTag] = encryptedData.split(':');
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

---

## 5. 性能优化设计

### 5.1 缓存架构设计

#### 5.1.1 多级缓存策略

```typescript
interface CacheStrategy {
  // L1: 应用内存缓存 (最快)
  l1Cache: Map<string, CacheEntry>;

  // L2: Redis分布式缓存 (快)
  l2Cache: RedisClient;

  // L3: 数据库 (较慢)
  database: PrismaClient;
}

class PermissionCache {
  private cacheStrategy: CacheStrategy;

  async getPermissions(userId: string): Promise<Permission[]> {
    const cacheKey = `user:permissions:${userId}`;

    // L1缓存查询 (内存)
    let permissions = this.cacheStrategy.l1Cache.get(cacheKey)?.value;
    if (permissions) {
      return permissions;
    }

    // L2缓存查询 (Redis)
    const cachedData = await this.cacheStrategy.l2Cache.get(cacheKey);
    if (cachedData) {
      permissions = JSON.parse(cachedData);
      // 回填L1缓存
      this.cacheStrategy.l1Cache.set(cacheKey, {
        value: permissions,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟
      });
      return permissions;
    }

    // L3数据库查询
    permissions = await this.loadPermissionsFromDB(userId);

    // 回填缓存
    await this.cacheStrategy.l2Cache.setex(
      cacheKey,
      15 * 60, // 15分钟
      JSON.stringify(permissions)
    );

    this.cacheStrategy.l1Cache.set(cacheKey, {
      value: permissions,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return permissions;
  }

  // 缓存失效
  async invalidateUserPermissions(userId: string): Promise<void> {
    const cacheKey = `user:permissions:${userId}`;

    // 清除L1缓存
    this.cacheStrategy.l1Cache.delete(cacheKey);

    // 清除L2缓存
    await this.cacheStrategy.l2Cache.del(cacheKey);
  }
}
```

#### 5.1.2 权限结果缓存

```typescript
interface PermissionCacheEntry {
  userId: string;
  permission: string;
  resourceHash: string;
  result: boolean;
  reason: string;
  expiresAt: Date;
}

class PermissionResultCache {
  async cacheResult(
    userId: string,
    permission: string,
    context: any,
    result: PermissionResult
  ): Promise<void> {
    const resourceHash = this.hashContext(context);
    const cacheKey = `perm:${userId}:${permission}:${resourceHash}`;

    await this.redis.setex(
      cacheKey,
      15 * 60,
      JSON.stringify({
        result: result.allowed,
        reason: result.reason,
        cachedAt: new Date().toISOString(),
      })
    );
  }

  async getCachedResult(
    userId: string,
    permission: string,
    context: any
  ): Promise<PermissionResult | null> {
    const resourceHash = this.hashContext(context);
    const cacheKey = `perm:${userId}:${permission}:${resourceHash}`;

    const cached = await this.redis.get(cacheKey);
    if (!cached) return null;

    const data = JSON.parse(cached);
    return {
      allowed: data.result,
      reason: data.reason,
      fromCache: true,
      ttl: await this.redis.ttl(cacheKey),
    };
  }
}
```

### 5.2 数据库优化

#### 5.2.1 索引设计策略

```sql
-- 用户相关索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_organization ON users(organization);
CREATE INDEX idx_users_status ON users(is_active, created_at);

-- 权限相关索引
CREATE INDEX idx_permissions_identifier ON permissions(identifier);
CREATE INDEX idx_permissions_category ON permissions(category, resource, action);

-- 角色权限关联索引
CREATE INDEX idx_user_roles_user ON user_roles(user_id, assigned_at);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id, permission_id);

-- OAuth令牌索引
CREATE INDEX idx_access_tokens_token ON access_tokens(token);
CREATE INDEX idx_access_tokens_user ON access_tokens(user_id, expires_at);
CREATE INDEX idx_access_tokens_client ON access_tokens(client_id, created_at);

-- 审计日志索引
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action, created_at);
CREATE INDEX idx_audit_logs_time ON audit_logs(created_at);
```

#### 5.2.2 查询优化

```typescript
class OptimizedPermissionQueries {
  // 批量权限查询优化
  async getUserPermissionsBatch(userIds: string[]): Promise<Map<string, Permission[]>> {
    const query = `
      SELECT DISTINCT 
        ur.user_id,
        p.identifier,
        p.name,
        p.category,
        p.resource,
        p.action
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id IN (${userIds.map(() => '?').join(',')})
        AND ur.is_active = 1
        AND p.is_active = 1
      ORDER BY ur.user_id, p.category, p.resource
    `;

    const results = await this.db.$queryRaw(query, ...userIds);

    // 按用户分组
    const permissionMap = new Map<string, Permission[]>();
    for (const row of results) {
      if (!permissionMap.has(row.user_id)) {
        permissionMap.set(row.user_id, []);
      }
      permissionMap.get(row.user_id)!.push({
        identifier: row.identifier,
        name: row.name,
        category: row.category,
        resource: row.resource,
        action: row.action,
      });
    }

    return permissionMap;
  }

  // 权限检查优化查询
  async checkUserHasPermission(userId: string, permission: string): Promise<boolean> {
    const query = `
      SELECT 1 
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
        AND p.identifier = ?
        AND ur.is_active = 1
        AND p.is_active = 1
      LIMIT 1
    `;

    const result = await this.db.$queryRaw(query, userId, permission);
    return result.length > 0;
  }
}
```

---

## 6. 部署架构设计

### 6.1 容器化部署

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# 依赖安装阶段
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

# 生产运行阶段
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 6.2 Docker Compose配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  auth-server:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://auth_user:auth_pass@mysql:3306/auth_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mysql
      - redis
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root_password
      - MYSQL_DATABASE=auth_db
      - MYSQL_USER=auth_user
      - MYSQL_PASSWORD=auth_pass
    volumes:
      - mysql_data:/var/lib/mysql
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - '3306:3306'
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - auth-server
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:
```

### 6.3 生产环境配置

```typescript
// config/production.ts
export const productionConfig = {
  // 服务配置
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
  },

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: 10,
      max: 30,
    },
    ssl: process.env.NODE_ENV === 'production',
  },

  // Redis配置
  redis: {
    url: process.env.REDIS_URL,
    cluster: process.env.REDIS_CLUSTER === 'true',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },

  // JWT配置
  jwt: {
    privateKey: process.env.JWT_PRIVATE_KEY,
    publicKey: process.env.JWT_PUBLIC_KEY,
    algorithm: 'RS256',
    accessTokenTTL: 3600, // 1小时
    refreshTokenTTL: 604800, // 7天
  },

  // 安全配置
  security: {
    bcryptRounds: 12,
    httpsOnly: true,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [],
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 1000, // 每窗口最大请求数
    },
  },

  // 监控配置
  monitoring: {
    prometheus: {
      enabled: true,
      port: 9090,
    },
    logging: {
      level: 'info',
      format: 'json',
    },
  },
};
```

---

## 7. 监控和运维

### 7.1 性能监控指标

```typescript
// 关键性能指标
interface Metrics {
  // 认证相关
  authenticationLatency: Histogram; // 认证延迟
  authenticationSuccess: Counter; // 认证成功次数
  authenticationFailure: Counter; // 认证失败次数

  // 权限验证相关
  permissionCheckLatency: Histogram; // 权限检查延迟
  permissionCheckRate: Counter; // 权限检查频率
  cacheHitRate: Gauge; // 缓存命中率

  // 系统资源
  memoryUsage: Gauge; // 内存使用
  cpuUsage: Gauge; // CPU使用率
  databaseConnections: Gauge; // 数据库连接数

  // 业务指标
  activeUsers: Gauge; // 活跃用户数
  tokenIssuanceRate: Counter; // 令牌颁发频率
  policyEvaluations: Counter; // 策略评估次数
}
```

### 7.2 告警规则

```yaml
# prometheus/alerts.yml
groups:
  - name: auth-server
    rules:
      - alert: HighAuthenticationLatency
        expr: histogram_quantile(0.95, auth_latency_seconds) > 2
        for: 5m
        annotations:
          summary: '认证延迟过高'

      - alert: HighPermissionCheckLatency
        expr: histogram_quantile(0.99, permission_check_seconds) > 0.1
        for: 2m
        annotations:
          summary: '权限检查延迟过高'

      - alert: LowCacheHitRate
        expr: cache_hit_rate < 0.8
        for: 5m
        annotations:
          summary: '缓存命中率过低'

      - alert: DatabaseConnectionPoolExhausted
        expr: db_connections_active / db_connections_max > 0.9
        for: 1m
        annotations:
          summary: '数据库连接池即将耗尽'
```

这个技术设计文档为OAuth2.1认证授权中心提供了完整的架构指导，包含了具体的实现细节、API设计、安全考虑和部署策略，可以直接指导开发团队进行实施。
