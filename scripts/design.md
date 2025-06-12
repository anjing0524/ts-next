# OAuth2.1 + RBAC 认证授权中心技术设计文档

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
│  │ OAuth2.1    │  │ RBAC权限    │  │ 统一权限    │           │
│  │ 认证服务     │  │ 管理服务     │  │ 验证服务     │           │
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

#### 1.3.1 用户认证管理服务 (User Authentication Management Service)

**职责**: 负责用户的全生命周期管理、身份认证、会话管理以及账户安全策略。

- **用户注册与登录 (UC-2.1.1-001, UC-2.1.1-002)**: 提供用户名/密码注册和登录功能，支持SSO。
- **密码策略管理 (UC-2.1.2-001, UC-2.1.2-002)**: 实现密码复杂度、有效期、历史密码限制等策略。
- **账户安全 (UC-2.1.3-001, UC-2.1.3-002, UC-2.1.3-003)**: 支持账户锁定、解锁、二次验证（MFA）配置。
- **会话管理**: 用户登录状态的维持、校验与登出。

**核心API (示例)**:

```typescript
interface UserAuthenticationManagementService {
  // 用户管理
  registerUser(params: RegisterUserParams): Promise<User>;
  getUserProfile(userId: string): Promise<UserProfile>;
  updateUserProfile(userId: string, profile: UserProfileUpdateParams): Promise<UserProfile>;
  changePassword(userId: string, params: ChangePasswordParams): Promise<void>;
  resetPasswordRequest(email: string): Promise<void>; // 密码重置请求
  resetPasswordConfirm(token: string, newPassword: string): Promise<void>; // 密码重置确认

  // 认证与会话
  login(credentials: LoginCredentials): Promise<LoginResult>; // 包含访问令牌、刷新令牌、会话信息
  logout(sessionId: string): Promise<void>;
  validateSession(sessionId: string): Promise<SessionInfo>;
  refreshAccessToken(refreshToken: string): Promise<TokenResult>;

  // 账户安全
  setupMFA(userId: string, mfaType: string): Promise<MFAConfigResult>;
  verifyMFA(userId: string, code: string): Promise<boolean>;
  lockAccount(userId: string): Promise<void>;
  unlockAccount(userId: string): Promise<void>;
}
```

#### 1.3.2 OAuth2.1认证服务 (OAuth2.1 Authorization Service)

**职责**: 实现OAuth2.1协议的核心授权流程，管理客户端和令牌。

- **客户端注册与管理 (UC-2.3-001)**: 支持动态客户端注册和管理，包括客户端ID、密钥、回调地址等。
- **授权码模式 (UC-2.2-001)**: 实现Authorization Code Grant，支持PKCE。
- **客户端凭据模式 (UC-2.2-002)**: 实现Client Credentials Grant，用于服务间认证。
- **令牌管理 (UC-2.4-001, UC-2.4-002)**: 访问令牌和刷新令牌的生成、验证、吊销和刷新。
- **令牌自省 (UC-2.2-003)**: 提供令牌校验端点。

**核心API (示例)**:

```typescript
interface OAuth2AuthorizationService {
  // OAuth2.1 标准端点
  authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult>; // 处理授权请求，返回授权码或错误
  token(params: OAuthTokenParams): Promise<OAuthTokenResult>; // 处理令牌请求，发放访问令牌和刷新令牌
  introspectToken(
    token: string,
    tokenTypeHint?: 'access_token' | 'refresh_token'
  ): Promise<TokenIntrospectionResult>; // 令牌自省
  revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void>; // 令牌吊销
  userinfo(accessToken: string): Promise<UserInfo>; // 获取用户信息

  // 客户端管理 (对应 UC-2.3-001)
  registerClient(clientDetails: ClientRegistrationParams): Promise<ClientInfo>;
  getClientDetails(clientId: string): Promise<ClientInfo>;
  updateClient(clientId: string, updates: ClientUpdateParams): Promise<ClientInfo>;
  deleteClient(clientId: string): Promise<void>;
}
```

#### 1.3.3 RBAC权限管理服务 (RBAC Permission Management Service)

**职责**: 基于角色的访问控制管理，包括角色、权限的定义、分配和查询。

- **角色管理 (UC-2.5.2-001)**: 创建、读取、更新、删除角色。
- **权限管理 (UC-2.5.2-002)**: 定义和管理系统中的细粒度权限。
- **角色权限分配 (UC-2.5.2-003)**: 将权限分配给角色，将用户分配给角色。

**核心API (示例)**:

```typescript
interface RBACManagementService {
  // 角色管理
  createRole(roleData: CreateRoleParams): Promise<Role>;
  getRole(roleId: string): Promise<Role>;
  updateRole(roleId: string, updates: UpdateRoleParams): Promise<Role>;
  deleteRole(roleId: string): Promise<void>;
  listRoles(params: ListParams): Promise<Role[]>;

  // 权限管理
  createPermission(permissionData: CreatePermissionParams): Promise<Permission>;
  getPermission(permissionId: string): Promise<Permission>;
  updatePermission(permissionId: string, updates: UpdatePermissionParams): Promise<Permission>;
  deletePermission(permissionId: string): Promise<void>;
  listPermissions(params: ListParams): Promise<Permission[]>;

  // 分配与查询
  assignPermissionToRole(roleId: string, permissionId: string): Promise<void>;
  removePermissionFromRole(roleId: string, permissionId: string): Promise<void>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  assignUserToRole(userId: string, roleId: string): Promise<void>;
  removeUserFromRole(userId: string, roleId: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
  checkUserPermission(userId: string, permissionIdentifier: string): Promise<boolean>; // 结合用户角色检查权限
}
```

#### 1.3.4 统一权限验证服务 (Unified Authorization Verification Service)

**职责**: 提供统一的权限验证入口，基于RBAC的验证逻辑。

- **单项API权限验证 (UC-2.7-001)**: 验证用户对特定API或资源的访问权限。
- **批量API权限验证 (UC-2.7-002)**: 批量验证多个权限点。
- **SDK与中间件集成 (UC-2.7-003)**: 提供客户端SDK和服务器端中间件，简化应用集成。

**核心API (示例)**:

```typescript
interface UnifiedAuthorizationVerificationService {
  // 权限验证
  verifyAccess(request: AccessVerificationRequest): Promise<AccessVerificationResult>; // 包含用户信息、资源信息、操作、环境上下文
  batchVerifyAccess(
    requests: AccessVerificationRequest[]
  ): Promise<BatchAccessVerificationResult[]>;

  // SDK/中间件支持 (概念性，具体实现可能在SDK中)
  // getVerificationMiddleware(options: MiddlewareOptions): MiddlewareFunction;
}

// AccessVerificationRequest 结构示例
interface AccessVerificationRequest {
  userId?: string; // 用户ID，可选，匿名访问或服务间调用时可能为空
  serviceClientId?: string; // 服务客户端ID，用于服务间调用
  roles?: string[]; // 用户角色，可选，如果提供则优先使用
  resource: string; // 目标资源标识 (e.g., 'api:/users/{id}', 'data:orders')
  action: string; // 操作 (e.g., 'read', 'write', 'delete')
}
```

#### 1.3.6 管理界面服务 (Admin Interface Service)

**职责**: 为管理员提供可视化管理界面，用于配置和监控认证授权系统。

- **用户管理界面 (UC-2.8.1-001 to UC-2.8.1-005)**: 查看用户列表、详情、创建、编辑、删除用户，管理用户状态。
- **角色与权限管理界面 (UC-2.8.2-001 to UC-2.8.2-004)**: 管理角色、权限定义，分配权限给角色，分配用户到角色。
- **OAuth客户端管理界面 (UC-2.8.3-001 to UC-2.8.3-003)**: 管理OAuth客户端的注册、配置、密钥等。

- **监控与审计界面 (UC-2.8.5-001, UC-2.8.5-002)**: 查看系统日志、审计跟踪、监控系统状态。

**核心功能 (通过API暴露给前端)**:

- 上述各管理服务 (UserAuthenticationManagementService, RBACManagementService, OAuth2AuthorizationService) 的API的组合调用。
- 审计日志查询API。
- 系统监控指标API。

---

## 2. 数据模型设计

### 2.1 核心实体与关联 (Conceptual ERD - PlantUML syntax)

```plantuml
@startuml
entity User {
  +id : UUID <<PK>>
  username : String
  passwordHash : String
  email : String
  isActive : Boolean
  isLocked : Boolean
  mfaEnabled : Boolean
  --
  createdAt : DateTime
  updatedAt : DateTime
}

entity UserProfile {
  +userId : UUID <<FK>>
  firstName : String
  lastName : String
  department : String
  organization : String
  workLocation : String
  --
  customAttributes : JSONB
}

entity Role {
  +id : UUID <<PK>>
  name : String
  description : String
  --
  createdAt : DateTime
  updatedAt : DateTime
}

entity Permission {
  +id : UUID <<PK>>
  name : String  // e.g., "user:create", "order:read"
  description : String
  category: String // e.g., 'system', 'app', 'api', 'data', 'page'
  resource_pattern: String // e.g., "/users/*", "/orders/{id}"
  action: String // e.g., "CREATE", "READ", "UPDATE", "DELETE"
  --
  createdAt : DateTime
  updatedAt : DateTime
}

entity OAuthClient {
  +id : UUID <<PK>>
  clientId : String <<Unique>>
  clientSecretHash : String
  redirectUris : String[]
  grantTypes : String[] // e.g., "authorization_code", "client_credentials", "refresh_token"
  responseTypes : String[] // e.g., "code", "token"
  scope : String // Space-separated list of scopes
  clientName : String
  logoUri : String
  --
  createdAt : DateTime
  updatedAt : DateTime
}

entity AuthorizationCode {
  +code : String <<PK>>
  userId : UUID <<FK>>
  oauthClientId : UUID <<FK>>
  redirectUri : String
  scope : String
  expiresAt : DateTime
  isUsed : Boolean
  pkceChallenge: String
  pkceMethod: String // "S256" or "plain"
  --
  createdAt : DateTime
}

entity AccessToken {
  +token : String <<PK>>
  userId : UUID <<FK>>
  oauthClientId : UUID <<FK>>
  scope : String
  expiresAt : DateTime
  --
  createdAt : DateTime
}

entity RefreshToken {
  +token : String <<PK>>
  userId : UUID <<FK>>
  oauthClientId : UUID <<FK>>
  scope : String
  expiresAt : DateTime
  isRevoked : Boolean
  --
  accessTokenJti : String // JTI of the associated access token
  createdAt : DateTime
}



' Relationships
User ||--|{ UserProfile : "has one (optional)"
User ||--o{ AuthorizationCode : "grants"
User ||--o{ AccessToken : "owns"
User ||--o{ RefreshToken : "owns"

OAuthClient ||--o{ AuthorizationCode : "generates for"
OAuthClient ||--o{ AccessToken : "issues for"
OAuthClient ||--o{ RefreshToken : "issues for"

' RBAC Many-to-Many through join table UserRole
User }o--o{ Role : UserRole
(User, Role) . UserRole

' RBAC Many-to-Many through join table RolePermission
Role }o--o{ Permission : RolePermission
(Role, Permission) . RolePermission



@enduml
```

**说明**:

- 上述ERD为概念模型，具体数据库表结构可能因Prisma或其他ORM的实现而略有不同。
- `UserProfile` 存储了用户的基本属性信息，如部门、组织、工作地点。
- `Permission` 实体现在更具体，包含了资源模式和操作。
- 多对多关系 (如 `UserRole`, `RolePermission`) 会通过联结表实现。

### 2.2 权限模型详细设计

#### 2.2.1 RBAC (Role-Based Access Control)

- **用户 (User)**: 系统中的操作主体。
- **角色 (Role)**: 一组权限的集合，代表了系统中的一种职责或身份 (如 `admin`, `editor`, `viewer`)。
- **权限 (Permission)**: 对特定资源执行特定操作的许可 (如 `CREATE_USER`, `READ_ORDER`, `UPDATE_DOCUMENT:sectionA`)。
  - **权限定义**: 权限应具有清晰的命名规范，例如 `resource:action` 或 `resource:sub_resource:action`。
  - **权限粒度**: 根据业务需求设计合适的权限粒度，避免过于粗糙或过于细致。
- **关系**:
  - 用户可以被分配一个或多个角色。
  - 角色可以包含一个或多个权限。
  - 用户的有效权限是其所有角色的权限总和。

#### 2.2.2 ABAC (Attribute-Based Access Control)

- **主体属性 (Subject Attributes)**: 描述发起访问请求的用户或服务的特征。
  - 示例: `user.department = 'Sales'`, `user.organization = 'HQ'`, `user.workLocation = 'New York'`, `user.securityClearance = 'Level2'`。
  - 这些属性主要存储在 `UserProfile` 表中，或在运行时从其他来源获取。
- **资源属性 (Resource Attributes)**: 描述被访问对象的特征。
  - 示例: `document.sensitivity = 'Confidential'`, `report.region = 'APAC'`, `data.owner = 'user_xyz'`。
- **操作属性 (Action Attributes)**: 描述主体试图对资源执行的操作。
  - 示例: `action.type = 'read'`, `action.type = 'write'`, `action.criticality = 'high'`。
- **环境属性 (Environment Attributes)**: 描述访问发生时的上下文条件。
  - 示例: `timeOfDay = '10:00'`, `ipAddress = '192.168.1.100'`, `device.securityPatchLevel = 'latest'`。
- **策略 (Policy)**: 一组规则，规定了在特定属性条件下是否允许或拒绝访问。
  - **策略结构**: 通常包含目标（Target - 哪些请求适用此策略）、条件（Condition - 属性之间的逻辑关系）和效果（Effect - Allow/Deny）。
  - **策略语言**: 可以使用JSON、YAML或自定义DSL来定义策略，如 `ABACPolicy` 实体所示。
  - **策略示例 (概念)**:
    ```json
    {
      "name": "AllowSalesReportsInWorkHours",
      "effect": "Allow",
      "target": {
        "subject": { "department": "Sales" },
        "resource": { "type": "Sales Report" },
        "action": ["read"]
      },
      "condition": {
        "operator": "AND",
        "operands": [
          { "attribute": "environment.timeOfDay", "operator": ">=", "value": "09:00" },
          { "attribute": "environment.timeOfDay", "operator": "<=", "value": "17:00" }
        ]
      }
    }
    ```
- **策略决策点 (PDP - Policy Decision Point)**: 评估适用策略并做出访问决策。
- **策略执行点 (PEP - Policy Enforcement Point)**: 拦截访问请求，向PDP查询决策，并执行该决策。

#### 2.2.3 权限标识符与组合

- **RBAC权限标识**: 如 `Permission` 实体中的 `name` (e.g., `user:create`, `order:read:{orderId}`).
- **ABAC策略**: 通过 `ABACPolicy` 实体定义，不直接使用单一标识符，而是通过属性匹配和条件评估。
- **组合决策**: 系统将首先基于RBAC检查用户是否拥有基础权限。如果RBAC允许，再通过ABAC引擎评估相关策略，以实现更细粒度的动态控制。
  - 例如，用户可能通过角色拥有 `document:read` 权限，但ABAC策略可能进一步限制其只能在特定时间、特定地点或针对特定敏感级别的文档执行此操作。

```typescript
// 概念性权限标识符 (主要用于RBAC)
interface PermissionIdentifier {
  category: 'system' | 'app' | 'api' | 'data' | 'page'; // 权限分类
  resource: string; // 资源标识, e.g., "users", "orders/{orderId}", "reports/financial"
  action: string; // 操作, e.g., "create", "read", "update", "delete", "approve"
}
```

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


```

---

## 3. API接口设计

本节详细描述核心服务的API端点，与PRD中的用例编号对应。

### 3.1 用户认证管理服务 API (对应 PRD 2.1)

**基础路径**: `/api/v1/users` (管理端), `/api/v1/account` (用户自助)

- **用户注册** (UC-2.1.1-001)
  - `POST /api/v1/account/register`
  - 请求体: `{ username, email, password, profile?: { firstName, lastName, department, organization, workLocation, customAttributes } }`
  - 响应: `201 Created` 用户信息 (不含密码)
- **用户登录** (UC-2.1.1-002)
  - `POST /api/v1/account/login`
  - 请求体: `{ username, password }`
  - 响应: `{ accessToken, refreshToken, expiresIn, user, sessionId }`
- **用户登出**
  - `POST /api/v1/account/logout`
  - Header: `Authorization: Bearer {accessToken}` 或 `Cookie: sessionId={sessionId}`
  - 响应: `200 OK`
- **获取当前用户信息**
  - `GET /api/v1/account/me`
  - Header: `Authorization: Bearer {accessToken}`
  - 响应: 用户详细信息及权限
- **修改密码** (UC-2.1.1-004)
  - `PUT /api/v1/account/password`
  - Header: `Authorization: Bearer {accessToken}`
  - 请求体: `{ currentPassword, newPassword }`
  - 响应: `200 OK`
- **请求密码重置**
  - `POST /api/v1/account/password-reset-request`
  - 请求体: `{ email }`
  - 响应: `200 OK` (即使邮箱不存在也返回成功，防止用户枚举)
- **确认密码重置**
  - `POST /api/v1/account/password-reset-confirm`
  - 请求体: `{ token, newPassword }`
  - 响应: `200 OK`
- **MFA设置** (UC-2.1.3-003)
  - `POST /api/v1/account/mfa/setup` (启用/配置新的MFA)
  - `GET /api/v1/account/mfa/status` (查看MFA状态)
  - `DELETE /api/v1/account/mfa/disable` (禁用MFA，可能需要额外验证)
- **管理端用户操作** (UC-2.8.1-001 to UC-2.8.1-005)
  - `GET /api/v1/admin/users`: 获取用户列表 (支持分页、过滤、排序)
  - `POST /api/v1/admin/users`: 创建新用户
  - `GET /api/v1/admin/users/{userId}`: 获取特定用户详情
  - `PUT /api/v1/admin/users/{userId}`: 更新用户信息 (包括profile, 状态等)
  - `DELETE /api/v1/admin/users/{userId}`: 删除用户
  - `POST /api/v1/admin/users/{userId}/lock`: 锁定用户 (UC-2.1.3-001)
  - `POST /api/v1/admin/users/{userId}/unlock`: 解锁用户 (UC-2.1.3-001)

### 3.2 OAuth2.1 认证服务 API (对应 PRD 2.2, 2.3, 2.4)

**基础路径**: `/oauth2`

- **授权端点** (UC-2.2-001 Authorization Code Grant)
  - `GET /oauth2/authorize`
  - 参数: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`
  - 响应: 登录和授权页面，成功后重定向到 `redirect_uri` 附带 `code` 和 `state`。
- **令牌端点** (UC-2.2-001 Authorization Code Grant, UC-2.2-002 Client Credentials Grant, UC-2.4-002 Refresh Token)
  - `POST /oauth2/token`
  - Content-Type: `application/x-www-form-urlencoded`
  - 参数 (Authorization Code): `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret` (for confidential clients), `code_verifier`
  - 参数 (Client Credentials): `grant_type=client_credentials`, `scope` (optional), `client_id`, `client_secret`
  - 参数 (Refresh Token): `grant_type=refresh_token`, `refresh_token`, `scope` (optional), `client_id`, `client_secret` (if applicable)
  - 响应 (JSON): `{ access_token, token_type="Bearer", expires_in, refresh_token?, scope?, id_token? }`
- **令牌吊销端点** (UC-2.4-001)
  - `POST /oauth2/revoke`
  - 参数: `token`, `token_type_hint` (optional: `access_token` or `refresh_token`), `client_id`, `client_secret` (for confidential clients)
  - 响应: `200 OK`
- **令牌自省端点** (UC-2.2-003, RFC 7662)
  - `POST /oauth2/introspect`
  - 参数: `token`, `token_type_hint` (optional), `client_id`, `client_secret` (if endpoint is protected for specific clients)
  - 响应 (JSON): `{ active: boolean, scope?, client_id?, username?, token_type?, exp?, iat?, sub?, iss?, jti?, ... }`
- **用户信息端点** (OpenID Connect)

  - `GET /oauth2/userinfo` or `POST /oauth2/userinfo`
  - Header: `Authorization: Bearer {accessToken}`
  - 响应 (JSON): User claims (e.g., `sub`, `name`, `email`, `profile`, `department`, `organization`, `workLocation`)

- **OAuth客户端管理 API** (UC-2.3-001, UC-2.8.3-001 to UC-2.8.3-003)
  - `POST /api/v1/admin/oauth/clients`: 注册新客户端
  - `GET /api/v1/admin/oauth/clients`: 获取客户端列表
  - `GET /api/v1/admin/oauth/clients/{clientId}`: 获取客户端详情
  - `PUT /api/v1/admin/oauth/clients/{clientId}`: 更新客户端配置
  - `DELETE /api/v1/admin/oauth/clients/{clientId}`: 删除客户端

### 3.3 RBAC 权限管理服务 API (对应 PRD 2.5, UC-2.8.2)

**基础路径**: `/api/v1/admin/rbac`

- **角色管理** (UC-2.5.2-001, UC-2.8.2-001)
  - `POST /roles`: 创建角色
  - `GET /roles`: 获取角色列表
  - `GET /roles/{roleId}`: 获取角色详情
  - `PUT /roles/{roleId}`: 更新角色
  - `DELETE /roles/{roleId}`: 删除角色
- **权限管理** (UC-2.5.2-002, UC-2.8.2-002)
  - `POST /permissions`: 创建权限定义
  - `GET /permissions`: 获取权限列表
  - `GET /permissions/{permissionId}`: 获取权限详情
  - `PUT /permissions/{permissionId}`: 更新权限定义
  - `DELETE /permissions/{permissionId}`: 删除权限定义
- **分配管理** (UC-2.5.2-003, UC-2.8.2-003, UC-2.8.2-004)
  - `POST /roles/{roleId}/permissions`: 为角色分配权限 (请求体: `{ permissionId }` or `[permissionId1, permissionId2]`)
  - `DELETE /roles/{roleId}/permissions/{permissionId}`: 从角色移除权限
  - `GET /roles/{roleId}/permissions`: 查看角色的权限列表
  - `POST /users/{userId}/roles`: 为用户分配角色 (请求体: `{ roleId }` or `[roleId1, roleId2]`)
  - `DELETE /users/{userId}/roles/{roleId}`: 从用户移除角色
  - `GET /users/{userId}/roles`: 查看用户的角色列表
  - `GET /users/{userId}/permissions`: 查看用户合并后的总权限列表 (直接和间接通过角色获得)

### 3.4 统一权限验证服务 API (对应 PRD 2.7)

**基础路径**: `/api/v1/authorize`

- **单项权限验证** (UC-2.7-001)
  - `POST /check`
  - 请求体: `AccessVerificationRequest` (参考1.3.5节定义)
    ```json
    // Example
    {
      "userId": "user-uuid-123",
      "resource": "document:confidential-specs",
      "action": "read"
    }
    ```
  - 响应: `{ allowed: boolean, reason?: string }`
- **批量权限验证** (UC-2.7-002)
  - `POST /batch-check`
  - 请求体: `AccessVerificationRequest[]` (数组，每个元素结构同上)
  - 响应: `Array<{ requestIndex: number, allowed: boolean, reason?: string }>`

### 3.6 审计与监控 API (对应 PRD 2.8.5)

**基础路径**: `/api/v1/admin/audit`, `/api/v1/admin/monitoring`

- **获取审计日志** (UC-2.8.5-001)
  - `GET /audit/logs`
  - 参数: `startDate`, `endDate`, `userId`, `eventType`, `page`, `pageSize`
  - 响应: 审计日志列表
- **获取系统监控数据** (UC-2.8.5-002)
  - `GET /monitoring/status` (e.g., QPS, latency, error rates for auth services)
  - `GET /monitoring/metrics` (Prometheus compatible metrics endpoint, optional)

---

```
## 4. 安全性考虑

系统的安全性是设计的核心要素之一，需要从多个层面进行保障，确保数据和服务的机密性、完整性和可用性。

### 4.1 认证安全 (PRD 2.1.3)

- **强密码策略** (UC-2.1.3-002):
    - 强制用户设置复杂密码（长度、字符类型组合）。
    - 密码存储使用强哈希算法（如Argon2id或bcrypt）加盐处理，防止彩虹表攻击。
    - 定期提醒或强制用户更新密码。
- **多因素认证 (MFA)** (UC-2.1.3-003):
    - 支持TOTP (Time-based One-Time Password) 作为第二因素认证。
    - 支持备用恢复码。
    - 用户可自行启用和管理MFA设备。
- **账户锁定与防暴力破解** (UC-2.1.3-001):
    - 登录尝试失败次数达到阈值后，账户临时锁定。
    - 对敏感操作（如登录、密码重置）实施速率限制。
    - 验证码机制防止机器人攻击。
- **会话管理**:
    - 会话ID应具有足够的随机性和长度。
    - 会话超时机制，长时间不活动自动登出。
    - 用户登出时，服务端会话应立即失效。
    - 防止会话固定攻击。

### 4.2 OAuth2.1 安全 (PRD 2.2, 2.4)

- **遵循OAuth 2.1规范**: 淘汰不安全的授权类型（如Implicit Grant和Resource Owner Password Credentials Grant）。
- **PKCE (Proof Key for Code Exchange)** (RFC 7636): 对所有使用授权码流程的客户端（包括公共客户端和机密客户端）强制使用PKCE，防止授权码注入攻击。
- **客户端认证**:
    - 机密客户端 (Confidential Clients) 使用客户端密钥 (`client_secret`) 或其他强认证机制（如mTLS）进行认证。
    - 公共客户端 (Public Clients) 不应存储密钥，依赖PKCE。
- **重定向URI验证**: 严格匹配已注册的重定向URI，防止开放重定向漏洞。
- **Scope控制**: 遵循最小权限原则，客户端仅请求必要的scope。
- **State参数**: 在授权请求中使用`state`参数防止CSRF攻击，并确保授权响应与请求对应。
- **令牌安全**:
    - **Access Token** (UC-2.2-003):
        - 建议使用不透明令牌或结构化令牌（如JWT）的混合模式。若为JWT，需使用强签名算法（如RS256, ES256）。
        - 短有效期（例如5-60分钟）。
        - 存储在客户端内存中，避免持久化存储在不安全的地方（如localStorage）。
        - 通过HTTPS传输。
    - **Refresh Token** (UC-2.4-002):
        - 必须是不透明的随机字符串。
        - 较长有效期（例如数天或数月）。
        - 安全存储：对于Web应用，存储在`HttpOnly`, `Secure`, `SameSite=Strict` (或 `Lax` 根据需求) 的Cookie中；对于原生应用，存储在系统提供的安全存储中。
        - 实施刷新令牌轮换 (Refresh Token Rotation) 机制，提高安全性。
        - 具备吊销机制 (UC-2.4-001)。
    - **ID Token** (OpenID Connect):
        - JWT格式，包含用户身份信息。
        - 必须进行签名验证和声明验证（`iss`, `aud`, `exp`, `nonce`）。
- **令牌泄露防护**:
    - 令牌自省端点 (`/oauth2/introspect`) (UC-2.2-003) 允许资源服务器验证令牌有效性。
    - 令牌吊销端点 (`/oauth2/revoke`) (UC-2.4-001) 允许客户端或用户吊销令牌。

### 4.3 数据安全

- **传输层安全 (TLS)**: 所有API接口和Web页面强制使用HTTPS (TLS 1.2+)，使用强加密套件。
- **存储加密**:
    - 敏感数据（如用户密码哈希、OAuth客户端密钥）在数据库中加密存储。
    - 数据库连接加密。
- **数据校验与过滤**:
    - 对所有外部输入（API请求参数、请求体、HTTP头部）进行严格的格式、类型、长度和内容校验。
    - 输出编码，防止XSS攻击。
    - 使用参数化查询或ORM，防止SQL注入。
- **备份与恢复**: 定期备份数据，并有经过测试的恢复流程。

### 4.4 应用安全 (OWASP Top 10)

- **A01:2021-Broken Access Control**: 通过RBAC的正确实施来解决。确保权限检查在服务端强制执行，覆盖所有功能和数据访问点。
- **A02:2021-Cryptographic Failures**: 遵循上述数据安全和令牌安全措施。
- **A03:2021-Injection**: 通过输入验证、参数化查询、输出编码等方式防止注入攻击。
- **A04:2021-Insecure Design**: 本设计文档旨在通过分层设计、模块化、最小权限等原则来规避不安全设计。
- **A05:2021-Security Misconfiguration**: 严格管理服务器、框架、依赖库的配置，禁用不必要的功能，及时打补丁。
- **A06:2021-Vulnerable and Outdated Components**: 定期进行依赖库安全扫描（如NPM Audit, Snyk），及时更新。
- **A07:2021-Identification and Authentication Failures**: 遵循上述认证安全和OAuth2.1安全措施。
- **A08:2021-Software and Data Integrity Failures**: 确保软件更新来源可信，对数据进行完整性校验（如使用签名）。
- **A09:2021-Security Logging and Monitoring Failures**: (PRD 2.8.5) 实施全面的审计日志和安全监控。
- **A10:2021-Server-Side Request Forgery (SSRF)**: 如果系统需要代表用户向其他内部或外部服务发出请求，需要严格校验目标URL，限制可访问的协议和端口。

### 4.5 API安全

- **认证与授权**: 所有API端点都必须经过认证和授权检查。
- **速率限制**: 对API请求实施速率限制，防止滥用和DoS攻击。
- **输入验证**: 严格验证所有API输入参数。
- **敏感数据暴露**: API响应中避免返回不必要的敏感数据。
- **HTTP安全头部**:
    - `Strict-Transport-Security (HSTS)`: 强制浏览器使用HTTPS。
    - `Content-Security-Policy (CSP)`: 防止XSS攻击。
    - `X-Content-Type-Options: nosniff`: 防止浏览器MIME类型嗅探。
    - `X-Frame-Options: DENY` 或 `SAMEORIGIN`: 防止点击劫持。
    - `Referrer-Policy`: 控制Referer头的发送。

### 4.6 基础设施安全

- **网络隔离**: 使用VPC、子网、安全组/防火墙规则限制网络访问。
- **操作系统和服务器硬化**: 最小化安装，及时更新补丁，禁用不必要的服务。
- **密钥管理**: 使用专门的密钥管理服务（如AWS KMS, HashiCorp Vault）管理加密密钥和敏感配置。

### 4.7 审计与监控 (PRD 2.8.5)

- **审计日志** (UC-2.8.5-001): 记录所有关键操作，包括用户登录、权限变更、策略修改、敏感数据访问等。日志应包含时间戳、用户身份、操作类型、目标资源、结果等信息。
- **安全监控与告警** (UC-2.8.5-002): 监控系统异常行为、安全事件（如多次登录失败、权限提升尝试），并设置实时告警机制。
```

---

## 5. 部署架构 (PRD 3.2)

本节描述系统的部署架构，旨在满足高可用、可伸缩和可维护性的要求。

### 5.1 逻辑部署图

```plantuml
@startuml Logic_Deployment_Diagram
!theme materia

package "用户端" {
  actor "用户" as User
  actor "第三方应用" as ThirdPartyApp
}

package "基础设施 (云平台 - 例如 AWS, Azure, GCP)" {
  node "API网关" as APIGateway
  node "负载均衡器" as LoadBalancer

  package "应用服务集群 (Kubernetes / ECS / Serverless)" {
    component "用户认证管理服务" as AuthService
    component "OAuth2.1认证服务" as OAuthService
    component "RBAC权限管理服务" as RBACService
    component "统一权限验证服务" as UnifiedPermissionService
    component "管理界面服务" as AdminUIService
  }

  package "数据存储层" {
    database "主数据库 (PostgreSQL)" as MainDB
    database "缓存数据库 (Redis)" as CacheDB
    database "审计日志存储 (Elasticsearch / Loki)" as AuditLogDB
  }

  package "监控与告警系统" {
    component "监控服务 (Prometheus)" as MonitoringService
    component "日志聚合 (Fluentd / Logstash)" as LogAggregator
    component "告警服务 (Alertmanager)" as AlertingService
  }
}

User --> APIGateway : HTTPS
ThirdPartyApp --> APIGateway : HTTPS (OAuth2.1)

APIGateway --> LoadBalancer
LoadBalancer --> AuthService
LoadBalancer --> OAuthService
LoadBalancer --> RBACService
LoadBalancer --> UnifiedPermissionService
LoadBalancer --> AdminUIService

AuthService <--> MainDB
AuthService <--> CacheDB
OAuthService <--> MainDB
OAuthService <--> CacheDB
RBACService <--> MainDB
UnifiedPermissionService <--> MainDB
UnifiedPermissionService <--> CacheDB
AdminUIService <--> MainDB

AuthService --> LogAggregator
OAuthService --> LogAggregator
RBACService --> LogAggregator
UnifiedPermissionService --> LogAggregator
AdminUIService --> LogAggregator

LogAggregator --> AuditLogDB
MonitoringService --> AuthService
MonitoringService --> OAuthService
MonitoringService --> RBACService
MonitoringService --> UnifiedPermissionService
MonitoringService --> AdminUIService
MonitoringService --> MainDB
MonitoringService --> CacheDB
MonitoringService --> AlertingService

@enduml
```

### 5.2 关键组件说明

- **API网关**: 统一的请求入口，负责请求路由、认证、限流、日志记录等。
- **负载均衡器**: 将流量分发到后端的应用服务实例，实现高可用和水平扩展。
- **应用服务集群**: 运行核心业务逻辑的微服务，可以根据需求独立部署和扩展。
  - **用户认证管理服务**: 处理用户注册、登录、密码管理、MFA等。
  - **OAuth2.1认证服务**: 实现OAuth 2.1授权服务器功能。
  - **RBAC权限管理服务**: 管理角色、权限及其分配。
  - **统一权限验证服务**: 提供统一的权限校验接口。
  - **管理界面服务**: 提供系统管理后台功能。
- **主数据库 (PostgreSQL)**: 存储核心业务数据，如用户信息、角色、权限、OAuth客户端等。
- **缓存数据库 (Redis)**: 缓存热点数据，如会话信息、权限数据、访问令牌等，提升性能。
- **审计日志存储**: 存储审计日志，用于安全分析和合规性检查。
- **监控与告警系统**: 收集系统指标、日志，并提供告警功能。

### 5.3 部署环境 (PRD 3.2.1)

- **开发环境**: 用于开发和单元测试，可使用Docker Compose或本地Kubernetes (Minikube, Kind)。
- **测试环境**: 独立的测试环境，用于集成测试、UAT测试，数据与生产隔离。
- **预生产环境 (Staging)**: 与生产环境配置尽可能一致，用于上线前的最后验证。
- **生产环境**: 部署在云平台上，具备高可用、灾备和弹性伸缩能力。

### 5.4 可伸缩性与高可用性 (PRD 3.1.1, 3.1.4)

- **水平扩展**: 应用服务设计为无状态或状态分离，易于通过增加实例数量进行水平扩展。
- **数据库扩展**: 主数据库可采用读写分离、分片等策略；缓存数据库可集群化。
- **冗余设计**: 关键组件（如负载均衡器、数据库、应用服务实例）采用冗余部署，避免单点故障。
- **故障切换**: 自动化故障检测和切换机制。
- **数据备份与恢复**: 定期备份数据，并有经过验证的灾难恢复计划 (PRD 4.3)。

---

## 6. 技术选型 (PRD 3.3)

| 类别                | 技术/框架/服务                                               | 理由                                                                     |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **后端语言**        | Node.js (TypeScript)                                         | 高性能I/O, 异步非阻塞, 庞大的NPM生态, TypeScript提供类型安全。           |
| **Web框架**         | NestJS / Express.js                                          | NestJS提供模块化、可测试的架构；Express.js轻量灵活。根据团队熟悉度选择。 |
| **数据库**          | PostgreSQL                                                   | 功能强大, ACID兼容, 扩展性好, 开源, 社区活跃。                           |
| **缓存**            | Redis                                                        | 高性能键值存储, 支持多种数据结构, 广泛用于缓存、会话管理。               |
| **ORM/查询构建器**  | Prisma / TypeORM                                             | Prisma提供类型安全的数据库访问；TypeORM功能全面。                        |
| **API网关**         | AWS API Gateway / Nginx / Kong                               | 成熟的API管理方案。                                                      |
| **容器化**          | Docker                                                       | 标准化的应用打包和部署方式。                                             |
| **容器编排**        | Kubernetes (EKS/GKE/AKS)                                     | 强大的容器编排平台, 实现自动化部署、扩展和管理。                         |
| **前端框架**        | React / Next.js                                              | React生态成熟, Next.js提供SSR/SSG, 优化SEO和首屏加载。                   |
| **状态管理(前端)**  | Redux / Zustand / Jotai                                      | 根据应用复杂度选择。                                                     |
| **代码版本控制**    | Git / GitHub                                                 | 分布式版本控制系统, 广泛使用。                                           |
| **CI/CD**           | GitHub Actions / Jenkins / GitLab CI                         | 自动化构建、测试和部署流程。                                             |
| **日志管理**        | ELK Stack (Elasticsearch, Logstash, Kibana) / Loki & Grafana | 集中式日志收集、存储、查询和可视化。                                     |
| **监控与告警**      | Prometheus & Grafana & Alertmanager                          | 开源监控解决方案, 强大的数据模型和查询语言。                             |
| **消息队列 (可选)** | RabbitMQ / Kafka                                             | 用于异步任务处理、服务间解耦 (如果需要)。                                |
| **安全库**          | `bcrypt`, `jsonwebtoken`, `helmet`, `csurf` 等NPM包          | 提供密码哈希、JWT处理、HTTP安全头部等功能。                              |

---

## 7. 监控、日志与告警 (PRD 3.1.1, 3.1.2, 3.1.5, 4.7)

### 7.1 监控指标

- **系统层面**: CPU使用率, 内存使用率,磁盘I/O, 网络流量。
- **应用层面**:
  - QPS (每秒查询率), RPS (每秒请求数)
  - 请求延迟 (平均值, P95, P99)
  - 错误率 (HTTP 4xx, 5xx)
  - 数据库连接池状态
  - 缓存命中率
- **业务层面**:
  - 用户登录成功/失败次数
  - OAuth授权请求数
  - 令牌颁发/刷新/吊销次数
  - 权限校验通过/拒绝次数

### 7.2 日志收集

- **应用日志**: 记录应用运行过程中的关键信息、错误、警告。采用结构化日志格式 (如JSON)。
- **访问日志**: 记录API网关或Web服务器接收到的所有HTTP请求。
- **审计日志**: (PRD 2.8.5, 4.7) 记录安全相关的关键操作，详见安全性考虑部分。
- **收集方式**: 使用Fluentd或Logstash等工具将各服务产生的日志统一收集到中央日志存储系统。

### 7.3 告警机制

- **告警阈值**: 针对关键监控指标设置合理的告警阈值。
- **告警渠道**: 支持邮件、短信、Slack/Teams等多种通知方式。
- **告警级别**: 定义不同级别的告警（如P1严重, P2警告, P3通知）。
- **告警处理流程**: 建立清晰的告警响应和处理流程。

**示例告警场景**:

- 生产环境API接口错误率超过5%持续5分钟。
- 数据库CPU使用率超过80%持续10分钟。
- 关键服务实例宕机。
- 检测到可疑的登录尝试或权限提升行为。

---

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

````

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
````

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
