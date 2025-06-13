# OAuth2.1认证授权中心技术架构文档

## 1. 项目概述

### 1.1 项目定位

本系统是专为**企业内网环境**设计的OAuth2.1认证授权中心，作为企业应用生态的核心基础设施。系统安全边界由企业网络保障，专注于内网环境下的高效认证和精细化权限控制。

### 1.2 核心特性

- **OAuth2.1标准合规**: 95%以上的OAuth2.1标准合规性
- **PKCE支持**: 完整的PKCE (RFC 7636) 实现
- **OIDC集成**: OpenID Connect 1.0 标准支持
- **RBAC权限模型**: 基于角色的访问控制
- **企业级安全**: 多层次安全防护机制
- **高性能架构**: 优化的数据库设计和缓存策略

### 1.3 支持的认证场景

- **第三方页面API认证**: 为企业内部Web应用提供统一的OAuth2.1认证服务
- **服务间认证**: 支持微服务架构下的Service-to-Service认证
- **API服务器认证**: 为API网关和服务提供JWT令牌验证
- **第三方客户端认证**: 支持企业内部开发的各类客户端应用接入

## 2. 系统架构设计

### 2.1 整体架构

```mermaid
graph TB
    subgraph "客户端层"
        A[Web应用<br/>Next.js]
        B[移动应用<br/>React Native]
        C[第三方应用<br/>任意技术栈]
    end
    
    subgraph "API网关层"
        D[负载均衡器<br/>Nginx]
        E[API网关<br/>Optional]
        F[权限中间件<br/>Built-in]
    end
    
    subgraph "认证授权服务层"
        G[OAuth2.1<br/>标准服务]
        H[RBAC权限<br/>管理服务]
        I[统一权限<br/>验证服务]
        J[用户管理<br/>服务]
        K[服务间认证<br/>服务]
        L[审计服务<br/>完整追踪]
    end
    
    subgraph "数据层"
        M[MySQL<br/>优化索引]
        N[Redis<br/>权限缓存]
        O[文件存储<br/>日志/配置]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    E --> F
    F --> G
    F --> H
    F --> I
    G --> J
    H --> K
    I --> L
    G --> M
    H --> M
    I --> N
    J --> M
    K --> N
    L --> O
```

### 2.2 API架构设计

#### 2.2.1 API版本策略

- **v1 API**: 保持向后兼容，逐步迁移
- **v2 API**: 新的标准化架构，遵循RESTful设计
- **版本控制**: 通过URL路径进行版本控制 (`/api/v1/`, `/api/v2/`)

#### 2.2.2 v2 API架构

```
/api/v2/
├── oauth/                   # OAuth2.1核心端点
│   ├── authorize            # 授权端点
│   ├── token               # 令牌端点
│   ├── introspect          # 令牌内省
│   ├── revoke              # 令牌撤销
│   ├── userinfo            # 用户信息
│   └── consent             # 用户同意管理
├── auth/                    # 认证管理
│   ├── login               # 用户登录
│   ├── logout              # 用户登出
│   ├── register            # 用户注册
│   ├── refresh             # 令牌刷新
│   ├── me                  # 当前用户信息
│   ├── sessions/           # 会话管理
│   ├── password/           # 密码管理
│   ├── verify-email        # 邮箱验证
│   └── verify-phone        # 手机验证
├── users/                   # 用户管理
│   ├── {id}/profile        # 用户资料
│   ├── {id}/roles          # 用户角色
│   ├── {id}/permissions    # 用户权限
│   ├── {id}/avatar         # 用户头像
│   ├── {id}/login-history  # 登录历史
│   ├── {id}/password-history # 密码历史
│   ├── {id}/lock           # 用户锁定
│   ├── {id}/deactivate     # 用户停用
│   └── {id}/reset-password # 密码重置
├── clients/                 # 客户端管理
│   ├── {id}                # 客户端详情
│   └── registration        # 客户端注册
├── roles/                   # 角色管理
│   ├── {id}                # 角色详情
│   ├── {id}/permissions    # 角色权限
│   └── {id}/users          # 角色用户
├── permissions/             # 权限管理
│   ├── check               # 权限检查
│   ├── batch-check         # 批量权限检查
│   └── verify              # 权限验证
├── audit/                   # 审计管理
│   ├── logs/               # 操作日志
│   └── reports/            # 审计报告
├── system/                  # 系统管理
│   ├── config/             # 系统配置
│   ├── health/             # 健康检查
│   └── metrics/            # 系统指标
└── .well-known/            # 标准发现端点
    ├── oauth-authorization-server # OAuth服务器元数据
    ├── openid_configuration # OIDC配置
    └── jwks.json           # JSON Web Key Set
```

## 3. OAuth2.1标准实现

### 3.1 授权码流程 (Authorization Code Flow)

```mermaid
sequenceDiagram
    participant Client as 客户端应用
    participant Browser as 用户浏览器
    participant AuthServer as 认证服务器
    participant ResourceServer as 资源服务器
    
    Client->>Browser: 1. 重定向到授权端点
    Browser->>AuthServer: 2. GET /oauth/authorize + PKCE参数
    AuthServer->>Browser: 3. 显示登录/授权页面
    Browser->>AuthServer: 4. 用户登录并授权
    AuthServer->>Browser: 5. 重定向回客户端 + 授权码
    Browser->>Client: 6. 授权码回调
    Client->>AuthServer: 7. POST /oauth/token + 授权码 + PKCE验证
    AuthServer->>Client: 8. 返回访问令牌和刷新令牌
    Client->>ResourceServer: 9. API调用 + 访问令牌
    ResourceServer->>Client: 10. 返回受保护资源
```

### 3.2 PKCE实现

#### 3.2.1 Code Challenge生成

```typescript
// PKCE参数生成
const codeVerifier = generateCodeVerifier(); // 43-128字符的随机字符串
const codeChallenge = generateCodeChallenge(codeVerifier); // SHA256(codeVerifier) base64url编码
const codeChallengeMethod = 'S256'; // 使用SHA256方法
```

#### 3.2.2 授权请求

```http
GET /api/v2/oauth/authorize?
  response_type=code&
  client_id=example_client&
  redirect_uri=https://client.example.com/callback&
  scope=openid profile&
  state=xyz&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256
```

#### 3.2.3 令牌交换

```http
POST /api/v2/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=SplxlOBeZQQYbYS6WxSbIA&
redirect_uri=https://client.example.com/callback&
client_id=example_client&
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

### 3.3 OpenID Connect (OIDC) 支持

#### 3.3.1 ID Token结构

```json
{
  "iss": "https://auth.company.com",
  "sub": "cluser1test123456789012345",
  "aud": "example_client",
  "exp": 1640995200,
  "iat": 1640991600,
  "auth_time": 1640991600,
  "nonce": "n-0S6_WzA2Mj",
  "email": "user@company.com",
  "email_verified": true,
  "name": "John Doe",
  "preferred_username": "johndoe"
}
```

#### 3.3.2 UserInfo端点

```http
GET /api/v2/oauth/userinfo
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 3.3.3 发现端点

```http
GET /.well-known/openid_configuration
```

返回OIDC配置信息：

```json
{
  "issuer": "https://auth.company.com",
  "authorization_endpoint": "https://auth.company.com/api/v2/oauth/authorize",
  "token_endpoint": "https://auth.company.com/api/v2/oauth/token",
  "userinfo_endpoint": "https://auth.company.com/api/v2/oauth/userinfo",
  "jwks_uri": "https://auth.company.com/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"]
}
```

## 4. RBAC权限模型

### 4.1 权限层级结构

```
系统管理员 (SYSTEM_ADMIN)
├── 用户管理员 (USER_ADMIN)
├── 权限管理员 (PERMISSION_ADMIN)
├── 客户端管理员 (CLIENT_ADMIN)
├── 审计管理员 (AUDIT_ADMIN)
└── 普通用户 (USER)
```

### 4.2 权限类型

#### 4.2.1 菜单权限
控制用户可访问的管理界面菜单

```typescript
interface MenuPermission {
  id: string;
  name: string;
  path: string;
  icon?: string;
  permission: string; // 如: "menu:users:view"
  children?: MenuPermission[];
}
```

#### 4.2.2 API权限
控制用户可调用的API接口

```typescript
interface ApiPermission {
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string; // 如: "/api/v2/users/{id}"
  permission: string; // 如: "api:users:read"
  rateLimit?: number; // 速率限制
}
```

#### 4.2.3 数据权限
控制用户可访问的数据范围

```typescript
interface DataPermission {
  tableName: string;
  columnName?: string;
  conditions?: string; // JSON格式的过滤条件
  permission: string; // 如: "data:users:department_filter"
}
```

### 4.3 权限检查流程

```mermaid
flowchart TD
    A[API请求] --> B[提取JWT令牌]
    B --> C[验证令牌有效性]
    C --> D{令牌有效?}
    D -->|否| E[返回401未授权]
    D -->|是| F[提取用户ID]
    F --> G[查询用户角色]
    G --> H[查询角色权限]
    H --> I[检查API权限]
    I --> J{有权限?}
    J -->|否| K[返回403禁止访问]
    J -->|是| L[检查数据权限]
    L --> M[执行业务逻辑]
    M --> N[返回结果]
```

## 5. 数据库设计

### 5.1 核心表结构

#### 5.1.1 用户表 (users)

```sql
CREATE TABLE users (
  id VARCHAR(25) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  display_name VARCHAR(255),
  avatar VARCHAR(255),
  phone VARCHAR(20),
  organization VARCHAR(255),
  department VARCHAR(255),
  work_location VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  must_change_password BOOLEAN DEFAULT TRUE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until DATETIME,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_organization (organization),
  INDEX idx_department (department),
  INDEX idx_is_active (is_active)
);
```

#### 5.1.2 OAuth客户端表 (oauth_clients)

```sql
CREATE TABLE oauth_clients (
  id VARCHAR(25) PRIMARY KEY,
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret VARCHAR(255),
  client_name VARCHAR(255),
  client_description TEXT,
  client_type ENUM('PUBLIC', 'CONFIDENTIAL') DEFAULT 'PUBLIC',
  redirect_uris TEXT NOT NULL, -- JSON数组
  grant_types TEXT NOT NULL, -- JSON数组
  response_types TEXT NOT NULL, -- JSON数组
  allowed_scopes TEXT NOT NULL, -- JSON数组
  logo_uri VARCHAR(255),
  policy_uri VARCHAR(255),
  tos_uri VARCHAR(255),
  jwks_uri VARCHAR(255),
  token_endpoint_auth_method VARCHAR(50) DEFAULT 'client_secret_basic',
  require_pkce BOOLEAN DEFAULT TRUE,
  require_consent BOOLEAN DEFAULT TRUE,
  ip_whitelist TEXT, -- JSON数组
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_client_id (client_id),
  INDEX idx_client_type (client_type),
  INDEX idx_is_active (is_active),
  INDEX idx_client_id_active (client_id, is_active)
);
```

#### 5.1.3 权限表 (permissions)

```sql
CREATE TABLE permissions (
  id VARCHAR(25) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  resource VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  type ENUM('API', 'MENU', 'DATA') DEFAULT 'API',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_resource (resource),
  INDEX idx_action (action),
  INDEX idx_type (type),
  INDEX idx_is_active (is_active)
);
```

### 5.2 索引优化策略

#### 5.2.1 查询优化索引

```sql
-- 用户认证查询优化
CREATE INDEX idx_users_auth ON users (username, is_active);
CREATE INDEX idx_users_email_auth ON users (email, is_active);

-- 权限检查查询优化
CREATE INDEX idx_user_roles_active ON user_roles (user_id, role_id) 
  WHERE role.is_active = TRUE;

-- OAuth令牌查询优化
CREATE INDEX idx_access_tokens_lookup ON access_tokens (token_hash, is_revoked, expires_at);
CREATE INDEX idx_refresh_tokens_lookup ON refresh_tokens (token_hash, is_revoked, expires_at);

-- 审计日志查询优化
CREATE INDEX idx_audit_logs_user_time ON audit_logs (user_id, timestamp);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
```

#### 5.2.2 性能优化建议

1. **令牌存储优化**: 使用token_hash而非明文token进行数据库查询
2. **权限缓存**: 将用户权限信息缓存到Redis，减少数据库查询
3. **分页查询**: 所有列表查询都应支持分页，避免大数据量查询
4. **索引监控**: 定期监控慢查询，优化索引策略

## 6. 安全设计

### 6.1 令牌安全

#### 6.1.1 JWT令牌结构

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-1"
  },
  "payload": {
    "iss": "https://auth.company.com",
    "sub": "cluser1test123456789012345",
    "aud": "example_client",
    "exp": 1640995200,
    "iat": 1640991600,
    "jti": "unique-token-id",
    "scope": "openid profile email",
    "permissions": ["api:users:read", "menu:dashboard:view"]
  }
}
```

#### 6.1.2 令牌生命周期管理

- **访问令牌**: 15分钟有效期
- **刷新令牌**: 30天有效期
- **授权码**: 10分钟有效期
- **ID令牌**: 1小时有效期

#### 6.1.3 令牌撤销机制

```typescript
// 令牌撤销接口
POST /api/v2/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...&
token_type_hint=refresh_token&
client_id=example_client
```

### 6.2 密码安全策略

#### 6.2.1 密码复杂度要求

- 最小长度: 8字符
- 必须包含: 大写字母、小写字母、数字、特殊字符
- 不能与用户名、邮箱相同
- 不能使用常见弱密码

#### 6.2.2 密码历史管理

- 记录最近12次密码历史
- 新密码不能与历史密码相同
- 强制定期更换密码(可配置)

#### 6.2.3 账户锁定策略

- 连续5次登录失败后锁定账户
- 锁定时间: 15分钟
- 管理员可手动解锁

### 6.3 API安全防护

#### 6.3.1 速率限制

```typescript
// 不同端点的速率限制配置
const rateLimits = {
  '/api/v2/auth/login': { requests: 5, window: '15m' },
  '/api/v2/oauth/token': { requests: 10, window: '1m' },
  '/api/v2/users': { requests: 100, window: '1h' },
  '/api/v2/permissions/check': { requests: 1000, window: '1m' }
};
```

#### 6.3.2 输入验证

- 所有输入参数都必须经过验证
- 使用白名单验证而非黑名单
- 防止SQL注入、XSS攻击
- 文件上传安全检查

#### 6.3.3 HTTPS强制

- 所有API端点强制使用HTTPS
- 设置安全响应头
- 实施HSTS策略

## 7. 监控与审计

### 7.1 审计日志

#### 7.1.1 审计事件类型

```typescript
enum AuditEventType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTER = 'user_register',
  PASSWORD_CHANGE = 'password_change',
  PERMISSION_GRANT = 'permission_grant',
  PERMISSION_REVOKE = 'permission_revoke',
  CLIENT_REGISTER = 'client_register',
  TOKEN_ISSUE = 'token_issue',
  TOKEN_REVOKE = 'token_revoke',
  API_ACCESS = 'api_access',
  SECURITY_VIOLATION = 'security_violation'
}
```

#### 7.1.2 审计日志格式

```json
{
  "id": "audit-log-id",
  "timestamp": "2024-01-01T12:00:00Z",
  "event_type": "user_login",
  "user_id": "cluser1test123456789012345",
  "actor_type": "user",
  "actor_id": "cluser1test123456789012345",
  "resource_type": "user",
  "resource_id": "cluser1test123456789012345",
  "action": "login",
  "status": "success",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "session_id": "session-id",
  "details": {
    "login_method": "password",
    "client_id": "example_client"
  }
}
```

### 7.2 系统监控

#### 7.2.1 健康检查端点

```http
GET /api/v2/system/health
```

返回系统健康状态：

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "checks": {
    "database": {
      "status": "healthy",
      "response_time": "5ms"
    },
    "redis": {
      "status": "healthy",
      "response_time": "2ms"
    },
    "external_services": {
      "status": "healthy"
    }
  },
  "metrics": {
    "active_users": 1250,
    "active_sessions": 3420,
    "requests_per_minute": 850,
    "error_rate": "0.1%"
  }
}
```

#### 7.2.2 性能指标

- **响应时间**: API平均响应时间 < 200ms
- **吞吐量**: 支持1000+ QPS
- **可用性**: 99.9%以上
- **错误率**: < 0.1%

## 8. 部署与运维

### 8.1 部署架构

```mermaid
graph TB
    subgraph "生产环境"
        LB[负载均衡器]
        subgraph "应用层"
            APP1[认证服务实例1]
            APP2[认证服务实例2]
            APP3[认证服务实例3]
        end
        subgraph "数据层"
            DB_MASTER[MySQL主库]
            DB_SLAVE[MySQL从库]
            REDIS_MASTER[Redis主节点]
            REDIS_SLAVE[Redis从节点]
        end
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    APP1 --> DB_MASTER
    APP2 --> DB_MASTER
    APP3 --> DB_MASTER
    APP1 --> REDIS_MASTER
    APP2 --> REDIS_MASTER
    APP3 --> REDIS_MASTER
    DB_MASTER --> DB_SLAVE
    REDIS_MASTER --> REDIS_SLAVE
```

### 8.2 环境配置

#### 8.2.1 开发环境

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  auth-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=mysql://user:pass@db:3306/auth_dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
  
  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpass
      - MYSQL_DATABASE=auth_dev
    ports:
      - "3306:3306"
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

#### 8.2.2 生产环境配置

```bash
# 环境变量配置
NODE_ENV=production
DATABASE_URL=mysql://user:pass@db-cluster:3306/auth_prod
REDIS_URL=redis://redis-cluster:6379
JWT_PRIVATE_KEY_PATH=/secrets/jwt-private-key.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt-public-key.pem
SESSION_SECRET=your-session-secret
ENCRYPTION_KEY=your-encryption-key
LOG_LEVEL=info
METRICS_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=365
```

### 8.3 运维监控

#### 8.3.1 日志管理

- **应用日志**: 结构化JSON格式
- **访问日志**: Nginx访问日志
- **审计日志**: 独立的审计日志系统
- **错误日志**: 错误追踪和告警

#### 8.3.2 备份策略

- **数据库备份**: 每日全量备份 + 实时增量备份
- **配置备份**: 配置文件版本控制
- **密钥备份**: 加密存储的密钥备份
- **恢复测试**: 定期进行恢复演练

## 9. 开发指南

### 9.1 项目结构

```
project-root/
├── app/
│   └── api/
│       ├── v1/                 # V1 API (兼容性)
│       ├── v2/                 # V2 API (主要版本)
│       └── .well-known/        # 标准发现端点
├── lib/
│   ├── auth/                   # 认证相关工具
│   ├── services/               # 业务服务层
│   ├── utils/                  # 通用工具
│   └── types/                  # TypeScript类型定义
├── prisma/
│   ├── schema.prisma           # 数据库模型
│   ├── migrations/             # 数据库迁移
│   └── seed.ts                 # 种子数据
├── tests/
│   ├── unit/                   # 单元测试
│   ├── integration/            # 集成测试
│   └── e2e/                    # 端到端测试
├── docs/                       # 项目文档
└── scripts/                    # 构建和部署脚本
```

### 9.2 开发规范

#### 9.2.1 代码规范

- 使用TypeScript进行类型安全开发
- 遵循ESLint和Prettier代码格式化规范
- 使用统一的错误处理机制
- 编写完整的单元测试和集成测试

#### 9.2.2 API设计规范

- 遵循RESTful API设计原则
- 使用统一的响应格式
- 实施适当的HTTP状态码
- 提供完整的API文档

#### 9.2.3 安全开发规范

- 所有输入都必须验证
- 敏感信息不得记录到日志
- 使用参数化查询防止SQL注入
- 实施适当的访问控制

## 10. 总结

本技术架构文档详细描述了OAuth2.1认证授权中心的完整技术实现方案，涵盖了从系统架构、API设计、安全策略到部署运维的各个方面。该系统具备以下核心优势：

1. **标准合规**: 严格遵循OAuth2.1、PKCE、OIDC等国际标准
2. **安全可靠**: 多层次安全防护，完整的审计追踪
3. **高性能**: 优化的数据库设计和缓存策略
4. **易扩展**: 模块化设计，支持水平扩展
5. **易维护**: 清晰的代码结构和完整的文档

该架构为企业内网环境提供了一个安全、高效、标准化的认证授权解决方案，能够满足企业级应用的各种认证需求。