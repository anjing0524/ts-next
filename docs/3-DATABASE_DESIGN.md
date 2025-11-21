# OAuth 2.1 认证授权系统 - 数据库设计文档

**文档版本**: 1.0
**最后更新**: 2025-11-21
**文档状态**: ✅ 生产就绪
**数据库支持**: SQLite (开发) / PostgreSQL (生产，推荐使用 Supabase)

---

## 目录

1. [数据库概览](#数据库概览)
2. [表结构详解](#表结构详解)
3. [索引策略](#索引策略)
4. [关系图](#关系图)
5. [数据完整性约束](#数据完整性约束)
6. [分区和优化](#分区和优化)

---

## 数据库概览

### 表清单

| 表名 | 用途 | 行数估计 |
|------|------|---------|
| `users` | 用户账户 | 100K |
| `user_roles` | 用户-角色关联 | 200K |
| `roles` | 角色定义 | 100 |
| `role_permissions` | 角色-权限关联 | 1K |
| `permissions` | 权限定义 | 500 |
| `oauth_clients` | OAuth 客户端 | 50 |
| `auth_codes` | 临时授权码 | 1M (自动清理) |
| `access_tokens` | 访问令牌 | 100K (可选存储) |
| `refresh_tokens` | 刷新令牌 | 1M |
| `revoked_access_tokens` | 撤销的令牌黑名单 | 100K |
| `audit_logs` | 审计日志 | 100M+ |

---

## 表结构详解

### 1. 用户表 (users)

**用途**: 存储用户账户信息

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    is_active INTEGER DEFAULT 1,
    is_verified INTEGER DEFAULT 0,
    last_login_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (length(email) > 0),
    CHECK (length(username) >= 3),
    CHECK (length(password_hash) > 0)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK, NOT NULL | CUID 格式唯一标识 |
| `email` | TEXT | UNIQUE, NOT NULL | 用户邮箱,用于登录和恢复 |
| `username` | TEXT | UNIQUE, NOT NULL | 登录用户名,3+ 字符 |
| `password_hash` | TEXT | NOT NULL | bcrypt 密码哈希 (cost=12) |
| `first_name` | TEXT | | 名字 |
| `last_name` | TEXT | | 姓氏 |
| `avatar_url` | TEXT | | 头像 URL |
| `is_active` | INTEGER | DEFAULT 1 | 1=活跃, 0=禁用 |
| `is_verified` | INTEGER | DEFAULT 0 | 1=邮箱已验证, 0=未验证 |
| `last_login_at` | DATETIME | | 最后登录时间 |
| `created_at` | DATETIME | NOT NULL | 创建时间 (自动) |
| `updated_at` | DATETIME | NOT NULL | 更新时间 (自动) |

**数据示例**

```json
{
  "id": "cuid_2025110000001",
  "email": "admin@example.com",
  "username": "admin",
  "password_hash": "$2a$12$...",
  "first_name": "Admin",
  "last_name": "User",
  "is_active": 1,
  "is_verified": 1,
  "last_login_at": "2025-11-20T10:30:00Z",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

### 2. 用户角色关联表 (user_roles)

**用途**: 多对多关系,将用户与角色关联

```sql
CREATE TABLE user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(user_id, role_id)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | 关联记录唯一标识 |
| `user_id` | TEXT | FK, NOT NULL | 关联用户 |
| `role_id` | TEXT | FK, NOT NULL | 关联角色 |
| `assigned_at` | DATETIME | NOT NULL | 角色分配时间 |

**唯一约束**: 一个用户只能有一个相同的角色 (防止重复)

---

### 3. 角色表 (roles)

**用途**: 定义可用的角色

```sql
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (length(name) > 0)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | 角色唯一标识 |
| `name` | TEXT | UNIQUE, NOT NULL | 角色名称 |
| `description` | TEXT | | 角色描述 |
| `is_active` | INTEGER | DEFAULT 1 | 是否启用 |
| `created_at` | DATETIME | NOT NULL | 创建时间 |
| `updated_at` | DATETIME | NOT NULL | 更新时间 |

**预定义角色示例**

```sql
INSERT INTO roles (id, name, description) VALUES
    ('role_admin', 'Administrator', '系统管理员,拥有所有权限'),
    ('role_user', 'User', '普通用户'),
    ('role_viewer', 'Viewer', '查看者,只读权限');
```

---

### 4. 权限表 (permissions)

**用途**: 定义系统权限

```sql
CREATE TABLE permissions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (length(code) > 0)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | 权限唯一标识 |
| `code` | TEXT | UNIQUE, NOT NULL | 权限代码 (resource:action) |
| `description` | TEXT | | 权限描述 |
| `category` | TEXT | | 权限分类 (user_management, role_management) |
| `is_active` | INTEGER | DEFAULT 1 | 是否启用 |

**权限代码示例**

```
users:list         - 列出用户
users:create       - 创建用户
users:read         - 读取用户详情
users:update       - 更新用户
users:delete       - 删除用户
roles:manage       - 管理角色
permissions:view   - 查看权限
audit:view         - 查看审计日志
audit:export       - 导出审计日志
```

---

### 5. 角色权限关联表 (role_permissions)

**用途**: 多对多关系,将角色与权限关联

```sql
CREATE TABLE role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);
```

**权限继承示例**

```
Role: Admin
  └─ Permissions:
      ├─ users:list
      ├─ users:create
      ├─ users:read
      ├─ users:update
      ├─ users:delete
      ├─ roles:manage
      └─ audit:view

Role: Editor
  └─ Permissions:
      ├─ users:read
      ├─ users:update
      └─ audit:view
```

---

### 6. OAuth 客户端表 (oauth_clients)

**用途**: 存储 OAuth 2.1 客户端配置

```sql
CREATE TABLE oauth_clients (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    allowed_scopes TEXT NOT NULL,
    token_lifetime INTEGER DEFAULT 900,
    refresh_token_lifetime INTEGER DEFAULT 2592000,
    require_pkce INTEGER DEFAULT 1,
    is_confidential INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (owner_id) REFERENCES users(id),
    CHECK (length(id) > 0),
    CHECK (length(secret_hash) > 0)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK | client_id |
| `secret_hash` | TEXT | NOT NULL | bcrypt 哈希的 client_secret |
| `name` | TEXT | NOT NULL | 客户端名称 |
| `description` | TEXT | | 客户端描述 |
| `owner_id` | TEXT | FK | 客户端创建人 |
| `redirect_uris` | TEXT | NOT NULL | JSON 格式的回调 URI 列表 |
| `allowed_scopes` | TEXT | NOT NULL | JSON 格式的允许 scope 列表 |
| `token_lifetime` | INTEGER | DEFAULT 900 | Access Token 有效期 (秒) |
| `refresh_token_lifetime` | INTEGER | DEFAULT 2592000 | Refresh Token 有效期 (秒) |
| `require_pkce` | INTEGER | DEFAULT 1 | 是否强制 PKCE |
| `is_confidential` | INTEGER | DEFAULT 1 | 是否是机密客户端 |
| `is_active` | INTEGER | DEFAULT 1 | 是否启用 |

**JSON 字段示例**

```json
{
  "redirect_uris": [
    "http://localhost:6188/auth/callback",
    "https://admin.yourdomain.com/callback"
  ],
  "allowed_scopes": [
    "openid",
    "profile",
    "email"
  ]
}
```

---

### 7. 授权码表 (auth_codes)

**用途**: 存储临时授权码 (OAuth 2.1 授权码流程)

```sql
CREATE TABLE auth_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge VARCHAR(64),          -- Base64URL(SHA256) = 43 chars
    scope TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (client_id) REFERENCES oauth_clients(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    CHECK (expires_at > created_at)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `code_hash` | TEXT | UNIQUE | SHA256(authorization_code) |
| `code_challenge` | TEXT | | PKCE code_challenge (S256) |
| `expires_at` | DATETIME | NOT NULL | 过期时间 (默认 10 分钟) |
| `is_used` | INTEGER | DEFAULT 0 | 是否已使用 (单次使用) |

**自动清理**: 每小时清理过期的授权码

```sql
DELETE FROM auth_codes WHERE expires_at < CURRENT_TIMESTAMP;
```

---

### 8. 刷新令牌表 (refresh_tokens)

**用途**: 存储刷新令牌 (持久化存储)

```sql
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_token_hash TEXT,
    scope TEXT,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    is_rotated INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (client_id) REFERENCES oauth_clients(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    CHECK (expires_at > created_at)
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `token_hash` | TEXT | UNIQUE | SHA256(refresh_token) |
| `parent_token_hash` | TEXT | | 用于 Token Rotation 链追踪 |
| `revoked_at` | DATETIME | | 撤销时间 (NULL 表示未撤销) |
| `is_rotated` | INTEGER | DEFAULT 0 | 是否已轮换 |

**Token Rotation 示例**

```
初始 Refresh Token (RT1)
  ↓ (用户调用刷新)
新 Refresh Token (RT2)
  ├─ parent_token_hash = SHA256(RT1)
  └─ 旧 RT1 被标记为 revoked_at = NOW()

可以通过 parent_token_hash 追踪令牌链:
RT1 ← RT2 ← RT3 ← RT4
```

---

### 9. 审计日志表 (audit_logs)

**用途**: 记录所有重要操作

```sql
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    changes TEXT,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    CHECK (length(action_type) > 0),
    CHECK (status IN ('success', 'failure'))
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `action_type` | TEXT | NOT NULL | USER_LOGIN, PERMISSION_GRANT, TOKEN_REVOKED 等 |
| `resource_type` | TEXT | | user, role, permission, client, token |
| `resource_id` | TEXT | | 操作的资源 ID |
| `changes` | TEXT | | JSON 格式的变更数据 |
| `ip_address` | TEXT | | 请求来源 IP |
| `user_agent` | TEXT | | 浏览器 User-Agent |
| `status` | TEXT | CHECK | success 或 failure |
| `error_message` | TEXT | | 错误消息 (如果失败) |

**审计日志示例**

```json
{
  "id": "audit_uuid",
  "user_id": "admin_uuid",
  "action_type": "ROLE_ASSIGNED",
  "resource_type": "user",
  "resource_id": "user_uuid",
  "changes": {
    "before": {"roles": ["viewer"]},
    "after": {"roles": ["viewer", "editor"]}
  },
  "ip_address": "192.168.1.100",
  "status": "success",
  "created_at": "2025-11-20T10:30:00Z"
}
```

**数据保留政策**: 保留 2 年,后自动归档

---

### 10. 撤销的访问令牌表 (revoked_access_tokens)

**用途**: 访问令牌黑名单 (快速查询已撤销令牌)

```sql
CREATE TABLE revoked_access_tokens (
    jti TEXT PRIMARY KEY,
    revoked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);
```

**字段说明**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `jti` | TEXT | PK | JWT ID (令牌中的 jti claim) |
| `revoked_at` | DATETIME | NOT NULL | 撤销时间 |
| `expires_at` | DATETIME | NOT NULL | 令牌过期时间 |

**自动清理**: 令牌过期后自动删除

```sql
DELETE FROM revoked_access_tokens
WHERE expires_at < CURRENT_TIMESTAMP;
```

---

## 索引策略

### 性能关键索引

```sql
-- 用户查询优化
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_active ON users(is_active);

-- RBAC 查询优化
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_permissions_code ON permissions(code);

-- 令牌查询优化 (非常关键)
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at DESC);
CREATE INDEX idx_revoked_access_tokens_expires_at ON revoked_access_tokens(expires_at DESC);

-- OAuth 客户端查询
CREATE INDEX idx_oauth_clients_id ON oauth_clients(id);
CREATE INDEX idx_oauth_clients_owner_id ON oauth_clients(owner_id);

-- 审计日志查询
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);

-- 授权码查询 (短期)
CREATE INDEX idx_auth_codes_code_hash ON auth_codes(code_hash);
CREATE INDEX idx_auth_codes_client_id ON auth_codes(client_id);
CREATE INDEX idx_auth_codes_expires_at ON auth_codes(expires_at DESC);
```

### 索引使用情况

| 索引 | 使用频率 | 查询操作 |
|------|---------|---------|
| idx_refresh_tokens_token_hash | 极高 (每次刷新) | 令牌验证 |
| idx_users_email/username | 高 (每次登录) | 用户认证 |
| idx_audit_logs_created_at | 高 (审计查询) | 日志检索 |
| idx_user_roles_user_id | 中 (权限加载) | RBAC 权限查询 |

---

## 关系图

### 完整 ER 图

```
┌──────────────┐
│    Users     │
├──────────────┤
│ id (PK)      │
│ email        │◄─────┐
│ username     │      │
│ password_hash│      │
│ ...          │      │
└──────────────┘      │
       │              │ 1
       │ N            │
    ┌──▼──────────┐   │
    │ User_Roles  │   │
    ├─────────────┤   │
    │ user_id (FK)├───┘
    │ role_id (FK)├──┐
    └─────────────┘  │
                     │ N
                  ┌──▼─────────┐
                  │   Roles    │
                  ├────────────┤
                  │ id (PK)    │
                  │ name       │
                  │ ...        │
                  └────┬───────┘
                       │ N
                   ┌───▼──────────────┐
                   │ Role_Permissions │
                   ├──────────────────┤
                   │ role_id (FK)     │
                   │ permission_id (FK)│
                   └───┬──────────────┘
                       │ N
                   ┌───▼─────────────┐
                   │ Permissions     │
                   ├─────────────────┤
                   │ id (PK)         │
                   │ code            │
                   │ description     │
                   └─────────────────┘

┌─────────────────┐
│ OAuth_Clients   │
├─────────────────┤
│ id (PK)         │
│ secret_hash     │
│ owner_id (FK)   │──┐
│ redirect_uris   │  │
│ ...             │  │
└────┬────────────┘  │
     │ N             │ 1
  ┌──▼──────────────┐│
  │ Auth_Codes      ││
  ├─────────────────┤│
  │ code_hash (PK)  ││
  │ client_id (FK)  ││
  │ user_id (FK)    ├┴──→ Users
  │ code_challenge  │
  │ expires_at      │
  └─────────────────┘

  ┌──────────────────┐
  │ Refresh_Tokens   │
  ├──────────────────┤
  │ token_hash (PK)  │
  │ client_id (FK)   │──→ OAuth_Clients
  │ user_id (FK)     │──→ Users
  │ expires_at       │
  │ revoked_at       │
  └──────────────────┘

┌──────────────────────────┐
│ Audit_Logs               │
├──────────────────────────┤
│ id (PK)                  │
│ user_id (FK) [nullable]  │──→ Users
│ action_type              │
│ resource_type            │
│ resource_id              │
│ changes (JSON)           │
│ ip_address               │
│ created_at               │
└──────────────────────────┘
```

---

## 数据完整性约束

### 外键约束

```sql
-- 删除用户时,自动删除相关记录
ALTER TABLE user_roles
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 删除角色时,自动删除角色权限关联
ALTER TABLE role_permissions
  ADD FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
```

### 检查约束

```sql
-- 确保时间逻辑正确
CHECK (expires_at > created_at)

-- 确保必填字段有值
CHECK (length(email) > 0)
CHECK (length(username) >= 3)

-- 确保枚举值有效
CHECK (status IN ('success', 'failure'))
CHECK (is_active IN (0, 1))
```

### 唯一约束

```sql
-- 防止重复
UNIQUE(user_id, role_id)        -- 用户角色
UNIQUE(role_id, permission_id)  -- 角色权限
UNIQUE(email)                   -- 邮箱
UNIQUE(username)                -- 用户名
UNIQUE(code_hash)               -- 授权码
UNIQUE(token_hash)              -- 令牌
```

---

## 分区和优化

### 审计日志分区 (MySQL 8.0+)

对于超大规模部署,可以按时间分区审计日志:

```sql
CREATE TABLE audit_logs (
    id TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    ...
) PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

### 清理过期数据

```sql
-- 清理过期授权码 (每小时)
DELETE FROM auth_codes WHERE expires_at < CURRENT_TIMESTAMP;

-- 清理过期令牌黑名单 (每天)
DELETE FROM revoked_access_tokens
WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY);

-- 归档旧审计日志 (每月)
DELETE FROM audit_logs
WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 YEAR);
```

---

**文档完成日期**: 2025-11-20
**数据库版本**: SQLite 3.40+ / MySQL 8.0+
**下一次审查**: 2026-02-20
**维护者**: DBA 团队
