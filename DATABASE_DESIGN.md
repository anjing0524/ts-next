# OAuth Service 数据库设计文档

**版本**: 2.0
**数据库引擎**: SQLite
**字符编码**: UTF-8
**日期**: 2025-11-13
**作者**: OAuth Service Rust Team

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. 设计原则](#2-设计原则)
- [3. 架构图](#3-架构图)
- [4. 表结构详解](#4-表结构详解)
  - [4.1 认证核心模型](#41-认证核心模型)
  - [4.2 权限管理核心](#42-权限管理核心)
  - [4.3 审计与监控](#43-审计与监控)
  - [4.4 OAuth Scopes](#44-oauth-scopes)
  - [4.5 安全相关](#45-安全相关)
- [5. 关系图](#5-关系图)
- [6. 索引策略](#6-索引策略)
- [7. 种子数据](#7-种子数据)
- [8. 迁移脚本说明](#8-迁移脚本说明)
- [9. 安全考虑](#9-安全考虑)
- [10. 性能优化](#10-性能优化)
- [11. 维护与监控](#11-维护与监控)

---

## 1. 概述

本数据库设计支持完整的 OAuth 2.1 授权服务器实现，包括：

- ✅ **OAuth 2.1 标准协议** - 授权码流程（带 PKCE）、令牌刷新、令牌撤销
- ✅ **OpenID Connect (OIDC)** - 用户身份认证和信息获取
- ✅ **RBAC 权限系统** - 基于角色的访问控制（Role-Based Access Control）
- ✅ **细粒度权限** - API、菜单、数据三层权限控制
- ✅ **多租户支持** - 支持多个 OAuth 客户端（第三方应用）
- ✅ **审计日志** - 完整的操作审计和安全追踪
- ✅ **安全增强** - 密码策略、登录限流、令牌撤销、IP 白名单

### 核心特性

| 特性 | 说明 |
|------|------|
| **规范化设计** | 第三范式（3NF），最小化数据冗余 |
| **外键约束** | 确保引用完整性，级联删除 |
| **索引优化** | 关键查询字段均建立索引 |
| **审计追踪** | 所有关键操作记录审计日志 |
| **时间戳** | 所有表包含创建和更新时间 |
| **软删除** | 关键数据支持逻辑删除（`is_active`） |

---

## 2. 设计原则

### 2.1 命名规范

- **表名**: 复数形式，snake_case（例如：`users`, `oauth_clients`）
- **主键**: 统一使用 `id` 字段，类型为 TEXT（CUID 格式）
- **外键**: 使用 `{table_name}_id` 格式（例如：`user_id`, `client_id`）
- **布尔字段**: 使用 INTEGER 类型（0/1），前缀为 `is_` 或 `has_`（例如：`is_active`, `require_pkce`）
- **时间戳**: 使用 DATETIME 类型，后缀为 `_at`（例如：`created_at`, `expires_at`）

### 2.2 数据类型选择

| 用途 | SQLite 类型 | 说明 |
|------|------------|------|
| 主键/外键 | TEXT | CUID 格式（例如：`clh1234567890abcdef000000`） |
| 字符串 | TEXT | 可变长度文本 |
| 整数 | INTEGER | 数字、布尔值（0/1） |
| 日期时间 | DATETIME | ISO 8601 格式 |
| JSON | TEXT | 序列化后的 JSON 字符串 |

### 2.3 约束规则

- **NOT NULL**: 必填字段强制非空
- **UNIQUE**: 唯一性字段（用户名、客户端ID等）
- **DEFAULT**: 合理的默认值（时间戳、布尔值等）
- **FOREIGN KEY**: 外键约束，级联删除（`ON DELETE CASCADE`）
- **CHECK**: 值域检查（可选，SQLite 支持有限）

### 2.4 安全设计

- **密码**: 不存储明文，仅存储 bcrypt hash（`password_hash`）
- **Token**: 存储 hash 值（`token_hash`），不存储明文（可选存储明文用于调试）
- **敏感配置**: 标记为敏感（`is_sensitive`），限制访问
- **审计日志**: 记录所有关键操作，包括 IP、User Agent
- **软删除**: 关键数据不物理删除，使用 `is_active` 标记

---

## 3. 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      OAuth 2.1 Authorization Server              │
└─────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
    ┌────▼────┐           ┌──────▼──────┐        ┌──────▼──────┐
    │  认证核心 │           │  权限管理核心 │        │  审计与监控  │
    └─────────┘           └─────────────┘        └─────────────┘
         │                       │                       │
    ┌────┴────┐           ┌──────┴──────┐        ┌──────┴──────┐
    │ • users │           │ • roles     │        │ • audit_logs│
    │ • oauth │           │ • perms     │        │ • password_ │
    │ • codes │           │ • menus     │        │   histories │
    │ • tokens│           │ • scope_*   │        │ • login_    │
    └─────────┘           └─────────────┘        │   attempts  │
                                                  └─────────────┘
```

---

## 4. 表结构详解

### 4.1 认证核心模型

#### 4.1.1 `users` - 用户表

存储系统用户的核心信息和认证凭证。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 用户唯一标识（CUID） |
| `username` | TEXT | UNIQUE NOT NULL | - | 用户名（用于登录） |
| `password_hash` | TEXT | NOT NULL | - | 密码哈希值（bcrypt） |
| `is_active` | INTEGER | - | 1 | 是否激活（1=是，0=否） |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |
| `last_login_at` | DATETIME | - | NULL | 最后登录时间 |
| `display_name` | TEXT | - | NULL | 显示名称 |
| `first_name` | TEXT | - | NULL | 名 |
| `last_name` | TEXT | - | NULL | 姓 |
| `avatar` | TEXT | - | NULL | 头像 URL |
| `organization` | TEXT | - | NULL | 组织/公司 |
| `department` | TEXT | - | NULL | 部门 |
| `must_change_password` | INTEGER | - | 1 | 是否需要修改密码 |
| `failed_login_attempts` | INTEGER | - | 0 | 失败登录次数 |
| `locked_until` | DATETIME | - | NULL | 账户锁定截止时间 |
| `created_by` | TEXT | - | NULL | 创建者用户 ID |

**索引**:
- `idx_users_username` - 用户名查询
- `idx_users_is_active` - 激活状态过滤
- `idx_users_organization` - 组织查询
- `idx_users_department` - 部门查询

**业务规则**:
- 用户名必须唯一
- 密码必须经过 bcrypt 加密（成本因子 ≥ 12）
- 失败登录次数达到阈值后锁定账户（默认 5 次）
- 锁定时长默认 15 分钟（通过 `locked_until` 控制）

---

#### 4.1.2 `oauth_clients` - OAuth 客户端表

存储第三方应用的 OAuth 2.1 客户端配置。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 客户端唯一标识（CUID） |
| `client_id` | TEXT | UNIQUE NOT NULL | - | 客户端 ID（OAuth 2.1） |
| `client_secret` | TEXT | - | NULL | 客户端密钥（机密客户端） |
| `name` | TEXT | NOT NULL | - | 客户端名称 |
| `description` | TEXT | - | NULL | 客户端描述 |
| `client_type` | TEXT | NOT NULL | 'PUBLIC' | 客户端类型（PUBLIC/CONFIDENTIAL） |
| `logo_uri` | TEXT | - | NULL | Logo URL |
| `policy_uri` | TEXT | - | NULL | 隐私政策 URL |
| `tos_uri` | TEXT | - | NULL | 服务条款 URL |
| `jwks_uri` | TEXT | - | NULL | JSON Web Key Set URI |
| `token_endpoint_auth_method` | TEXT | NOT NULL | 'client_secret_basic' | Token 端点认证方法 |
| `require_pkce` | INTEGER | NOT NULL | 1 | 是否要求 PKCE（1=是） |
| `require_consent` | INTEGER | NOT NULL | 1 | 是否要求用户同意（1=是） |
| `is_active` | INTEGER | NOT NULL | 1 | 是否激活 |
| `created_at` | DATETIME | NOT NULL | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | NOT NULL | CURRENT_TIMESTAMP | 更新时间 |
| `access_token_ttl` | INTEGER | NOT NULL | 3600 | 访问令牌有效期（秒） |
| `refresh_token_ttl` | INTEGER | NOT NULL | 2592000 | 刷新令牌有效期（秒） |
| `authorization_code_lifetime` | INTEGER | NOT NULL | 600 | 授权码有效期（秒） |
| `strict_redirect_uri_matching` | INTEGER | NOT NULL | 1 | 是否严格匹配重定向 URI |
| `allow_localhost_redirect` | INTEGER | NOT NULL | 0 | 是否允许 localhost 重定向 |
| `require_https_redirect` | INTEGER | NOT NULL | 1 | 是否要求 HTTPS 重定向 |

**索引**:
- `idx_oauth_clients_client_id` - 客户端 ID 查询
- `idx_oauth_clients_is_active` - 激活状态过滤
- `idx_oauth_clients_client_type` - 客户端类型过滤
- `idx_oauth_clients_client_id_active` - 复合索引（ID + 激活）

**关联表**:
- `client_redirect_uris` - 重定向 URI 列表（一对多）
- `client_grant_types` - 支持的授权类型（一对多）
- `client_response_types` - 支持的响应类型（一对多）
- `client_allowed_scopes` - 允许的权限范围（一对多）
- `client_permissions` - 客户端权限（一对多）
- `client_ip_whitelist` - IP 白名单（一对多）

**业务规则**:
- PUBLIC 客户端不应有 `client_secret`
- CONFIDENTIAL 客户端必须有 `client_secret`（bcrypt hash）
- `access_token_ttl` 推荐 1 小时（3600 秒）
- `refresh_token_ttl` 推荐 30 天（2592000 秒）
- 生产环境必须启用 `require_pkce` 和 `require_https_redirect`

---

#### 4.1.3 `client_redirect_uris` - 客户端重定向 URI 表

存储每个 OAuth 客户端允许的重定向 URI 列表。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `uri` | TEXT | NOT NULL | 重定向 URI |

**约束**:
- `PRIMARY KEY (client_id, uri)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

---

#### 4.1.4 `client_grant_types` - 客户端授权类型表

存储每个 OAuth 客户端支持的授权类型（Grant Types）。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `grant_type` | TEXT | NOT NULL | 授权类型（authorization_code, refresh_token, client_credentials 等） |

**约束**:
- `PRIMARY KEY (client_id, grant_type)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**常见授权类型**:
- `authorization_code` - 授权码流程
- `refresh_token` - 刷新令牌
- `client_credentials` - 客户端凭证（暂不支持）
- `password` - 密码模式（已弃用，不支持）

---

#### 4.1.5 `client_response_types` - 客户端响应类型表

存储每个 OAuth 客户端支持的响应类型（Response Types）。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `response_type` | TEXT | NOT NULL | 响应类型（code, token, id_token 等） |

**约束**:
- `PRIMARY KEY (client_id, response_type)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**常见响应类型**:
- `code` - 授权码（OAuth 2.1 推荐）
- `token` - 隐式授权（已弃用，不支持）
- `id_token` - OpenID Connect ID Token

---

#### 4.1.6 `client_allowed_scopes` - 客户端允许权限范围表

存储每个 OAuth 客户端允许请求的权限范围（Scopes）。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `scope` | TEXT | NOT NULL | 权限范围名称 |

**约束**:
- `PRIMARY KEY (client_id, scope)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

---

#### 4.1.7 `client_permissions` - 客户端权限表

存储每个 OAuth 客户端拥有的系统权限。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `permission` | TEXT | NOT NULL | 权限名称 |

**约束**:
- `PRIMARY KEY (client_id, permission)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

---

#### 4.1.8 `client_ip_whitelist` - 客户端 IP 白名单表

存储每个 OAuth 客户端允许访问的 IP 地址列表。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `client_id` | TEXT | NOT NULL, FK | 客户端 ID（外键） |
| `ip_address` | TEXT | NOT NULL | IP 地址（支持 IPv4/IPv6） |

**约束**:
- `PRIMARY KEY (client_id, ip_address)` - 联合主键
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**业务规则**:
- 如果白名单为空，则不限制 IP
- 支持 CIDR 表示法（需应用层实现）

---

#### 4.1.9 `authorization_codes` - 授权码表

存储 OAuth 2.1 授权码流程中生成的授权码。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 授权码记录 ID（CUID） |
| `code` | TEXT | UNIQUE NOT NULL | - | 授权码（随机生成） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `client_id` | TEXT | NOT NULL, FK | - | 客户端 ID（外键） |
| `redirect_uri` | TEXT | NOT NULL | - | 重定向 URI |
| `scope` | TEXT | NOT NULL | - | 权限范围（空格分隔） |
| `expires_at` | DATETIME | NOT NULL | - | 过期时间 |
| `code_challenge` | TEXT | - | NULL | PKCE 挑战值 |
| `code_challenge_method` | TEXT | - | NULL | PKCE 方法（S256/plain） |
| `nonce` | TEXT | - | NULL | OIDC nonce 参数 |
| `is_used` | INTEGER | - | 0 | 是否已使用（防止重放） |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |

**索引**:
- `idx_authorization_codes_code` - 授权码查询
- `idx_authorization_codes_user_id` - 用户查询
- `idx_authorization_codes_client_id` - 客户端查询
- `idx_authorization_codes_expires_at` - 过期时间查询
- `idx_authorization_codes_is_used` - 使用状态查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**业务规则**:
- 授权码有效期默认 10 分钟（600 秒）
- 授权码仅能使用一次（`is_used` 标记）
- 使用 PKCE 时必须验证 `code_challenge`
- 定期清理过期授权码

---

#### 4.1.10 `access_tokens` - 访问令牌表

存储 OAuth 2.1 访问令牌（Access Tokens）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 令牌记录 ID（CUID） |
| `token` | TEXT | UNIQUE | NULL | 令牌明文（可选，调试用） |
| `token_hash` | TEXT | UNIQUE | NULL | 令牌哈希值（安全存储） |
| `jti` | TEXT | UNIQUE | NULL | JWT ID（JWT 令牌） |
| `user_id` | TEXT | FK | NULL | 用户 ID（外键，可为空） |
| `client_id` | TEXT | NOT NULL, FK | - | 客户端 ID（外键） |
| `scope` | TEXT | NOT NULL | - | 权限范围（空格分隔） |
| `expires_at` | DATETIME | NOT NULL | - | 过期时间 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |

**索引**:
- `idx_access_tokens_token_hash` - 令牌哈希查询
- `idx_access_tokens_jti` - JWT ID 查询
- `idx_access_tokens_user_id` - 用户查询
- `idx_access_tokens_client_id` - 客户端查询
- `idx_access_tokens_expires_at` - 过期时间查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**业务规则**:
- 访问令牌有效期默认 1 小时（3600 秒）
- 生产环境仅存储 `token_hash`，不存储 `token` 明文
- JWT 令牌使用 `jti` 进行撤销控制
- 定期清理过期令牌

---

#### 4.1.11 `refresh_tokens` - 刷新令牌表

存储 OAuth 2.1 刷新令牌（Refresh Tokens）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 令牌记录 ID（CUID） |
| `token` | TEXT | UNIQUE | NULL | 令牌明文（可选，调试用） |
| `token_hash` | TEXT | UNIQUE | NULL | 令牌哈希值（安全存储） |
| `jti` | TEXT | UNIQUE | NULL | JWT ID（JWT 令牌） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `client_id` | TEXT | NOT NULL, FK | - | 客户端 ID（外键） |
| `scope` | TEXT | NOT NULL | - | 权限范围（空格分隔） |
| `expires_at` | DATETIME | NOT NULL | - | 过期时间 |
| `is_revoked` | INTEGER | - | 0 | 是否已撤销 |
| `revoked_at` | DATETIME | - | NULL | 撤销时间 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `previous_token_id` | TEXT | UNIQUE | NULL | 上一个令牌 ID（令牌轮换） |

**索引**:
- `idx_refresh_tokens_token_hash` - 令牌哈希查询
- `idx_refresh_tokens_jti` - JWT ID 查询
- `idx_refresh_tokens_user_id` - 用户查询
- `idx_refresh_tokens_client_id` - 客户端查询
- `idx_refresh_tokens_expires_at` - 过期时间查询
- `idx_refresh_tokens_is_revoked` - 撤销状态查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**业务规则**:
- 刷新令牌有效期默认 30 天（2592000 秒）
- 支持令牌轮换（Token Rotation）：`previous_token_id` 链接
- 撤销时设置 `is_revoked = 1` 和 `revoked_at`
- 定期清理过期和已撤销的令牌

---

### 4.2 权限管理核心

#### 4.2.1 `roles` - 角色表

存储系统角色定义（RBAC 模型）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 角色 ID（CUID） |
| `name` | TEXT | UNIQUE NOT NULL | - | 角色名称（唯一标识） |
| `display_name` | TEXT | NOT NULL | - | 显示名称 |
| `description` | TEXT | - | NULL | 角色描述 |
| `is_system_role` | INTEGER | - | 0 | 是否系统角色（不可删除） |
| `is_active` | INTEGER | - | 1 | 是否激活 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**索引**:
- `idx_roles_name` - 角色名称查询
- `idx_roles_is_active` - 激活状态过滤

**业务规则**:
- 系统角色（`is_system_role = 1`）不可删除或修改名称
- 角色名称必须唯一（如：`super_admin`, `admin`, `user`）

**默认角色**:
- `super_admin` - 超级管理员（所有权限）
- `admin` - 管理员（大部分权限）
- `user` - 普通用户（基本权限）

---

#### 4.2.2 `permissions` - 权限表

存储系统权限定义（细粒度权限控制）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 权限 ID（CUID） |
| `name` | TEXT | UNIQUE NOT NULL | - | 权限名称（唯一标识） |
| `display_name` | TEXT | NOT NULL | - | 显示名称 |
| `description` | TEXT | - | NULL | 权限描述 |
| `resource` | TEXT | NOT NULL | - | 资源名称（users, roles, clients 等） |
| `action` | TEXT | NOT NULL | - | 操作名称（list, create, read, update, delete 等） |
| `type` | TEXT | - | 'API' | 权限类型（API, MENU, DATA） |
| `is_system_perm` | INTEGER | - | 0 | 是否系统权限（不可删除） |
| `is_active` | INTEGER | - | 1 | 是否激活 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**索引**:
- `idx_permissions_name` - 权限名称查询
- `idx_permissions_resource` - 资源过滤
- `idx_permissions_action` - 操作过滤
- `idx_permissions_type` - 类型过滤
- `idx_permissions_is_active` - 激活状态过滤

**权限类型**:
- `API` - API 接口权限
- `MENU` - 菜单访问权限
- `DATA` - 数据权限（行级/列级）

**命名规范**:
- API 权限：`{resource}:{action}`（如：`users:list`, `users:create`）
- 菜单权限：`menu:{path}:view`（如：`menu:system:user:view`）
- 数据权限：`data:{table}:{condition}`

---

#### 4.2.3 `api_permissions` - API 权限详细信息表

存储 API 权限的详细配置（HTTP 方法、端点等）。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | API 权限记录 ID（CUID） |
| `permission_id` | TEXT | UNIQUE NOT NULL, FK | 权限 ID（外键） |
| `http_method` | TEXT | NOT NULL | HTTP 方法（GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD） |
| `endpoint` | TEXT | NOT NULL | API 端点（如：`/api/v2/admin/users`） |
| `rate_limit` | INTEGER | - | 速率限制（请求数/分钟） |

**索引**:
- `idx_api_permissions_http_method` - HTTP 方法过滤
- `idx_api_permissions_endpoint` - 端点查询

**外键**:
- `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE`

---

#### 4.2.4 `menu_permissions` - 菜单权限详细信息表

存储菜单权限的详细配置。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | 菜单权限记录 ID（CUID） |
| `permission_id` | TEXT | UNIQUE NOT NULL, FK | 权限 ID（外键） |
| `menu_id` | TEXT | NOT NULL | 菜单 ID |

**索引**:
- `idx_menu_permissions_menu_id` - 菜单 ID 查询

**外键**:
- `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE`

---

#### 4.2.5 `data_permissions` - 数据权限详细信息表

存储数据权限的详细配置（行级、列级权限）。

**字段列表**:

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | TEXT | PRIMARY KEY | 数据权限记录 ID（CUID） |
| `permission_id` | TEXT | UNIQUE NOT NULL, FK | 权限 ID（外键） |
| `table_name` | TEXT | NOT NULL | 表名 |
| `column_name` | TEXT | - | 列名（列级权限） |
| `conditions` | TEXT | - | 条件（JSON 格式，如：`{"department": "sales"}`） |

**索引**:
- `idx_data_permissions_table_name` - 表名查询
- `idx_data_permissions_column_name` - 列名查询

**外键**:
- `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE`

---

#### 4.2.6 `menus` - 菜单表

存储系统菜单结构（树形结构）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 菜单 ID（CUID） |
| `name` | TEXT | NOT NULL | - | 菜单名称 |
| `key` | TEXT | UNIQUE NOT NULL | - | 菜单唯一标识 |
| `path` | TEXT | - | NULL | 菜单路径 |
| `component` | TEXT | - | NULL | 组件路径 |
| `icon` | TEXT | - | NULL | 图标名称 |
| `order` | INTEGER | - | 0 | 排序顺序 |
| `is_hidden` | INTEGER | - | 0 | 是否隐藏 |
| `is_active` | INTEGER | - | 1 | 是否激活 |
| `parent_id` | TEXT | FK | NULL | 父菜单 ID（树形结构） |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**索引**:
- `idx_menus_key` - 菜单 Key 查询
- `idx_menus_parent_id` - 父菜单查询
- `idx_menus_order` - 排序查询
- `idx_menus_is_active` - 激活状态过滤

**外键**:
- `FOREIGN KEY (parent_id) REFERENCES menus(id)`

**业务规则**:
- 菜单支持多级嵌套（通过 `parent_id`）
- `order` 字段控制同级菜单的显示顺序
- `key` 必须唯一（用于权限关联）

---

#### 4.2.7 `user_roles` - 用户角色关联表

存储用户和角色的多对多关系。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `role_id` | TEXT | NOT NULL, FK | - | 角色 ID（外键） |
| `context` | TEXT | - | NULL | 上下文（JSON，如：部门、组织限制） |
| `expires_at` | DATETIME | - | NULL | 过期时间（临时角色） |
| `assigned_by` | TEXT | - | NULL | 分配者用户 ID |
| `assigned_at` | DATETIME | - | CURRENT_TIMESTAMP | 分配时间 |

**约束**:
- `PRIMARY KEY (user_id, role_id)` - 联合主键
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE`

**索引**:
- `idx_user_roles_expires_at` - 过期时间查询

**业务规则**:
- 一个用户可以拥有多个角色
- 支持临时角色（通过 `expires_at` 控制）
- `context` 字段支持上下文权限（如：仅对特定部门有效）

---

#### 4.2.8 `role_permissions` - 角色权限关联表

存储角色和权限的多对多关系。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `role_id` | TEXT | NOT NULL, FK | - | 角色 ID（外键） |
| `permission_id` | TEXT | NOT NULL, FK | - | 权限 ID（外键） |
| `conditions` | TEXT | - | NULL | 条件（JSON，如：数据范围限制） |
| `assigned_at` | DATETIME | - | CURRENT_TIMESTAMP | 分配时间 |

**约束**:
- `PRIMARY KEY (role_id, permission_id)` - 联合主键
- `FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE`
- `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE`

**业务规则**:
- 一个角色可以拥有多个权限
- `conditions` 字段支持条件权限（如：仅查看自己创建的数据）

---

### 4.3 审计与监控

#### 4.3.1 `audit_logs` - 审计日志表

存储所有关键操作的审计日志。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | UUID | 日志 ID（UUID） |
| `timestamp` | DATETIME | - | CURRENT_TIMESTAMP | 时间戳 |
| `user_id` | TEXT | FK | NULL | 用户 ID（外键，可为空） |
| `actor_type` | TEXT | NOT NULL | - | 操作者类型（USER, CLIENT, SYSTEM） |
| `actor_id` | TEXT | NOT NULL | - | 操作者 ID |
| `action` | TEXT | NOT NULL | - | 操作动作（如：CREATE_USER, DELETE_CLIENT） |
| `resource_type` | TEXT | - | NULL | 资源类型（users, roles, clients 等） |
| `resource_id` | TEXT | - | NULL | 资源 ID |
| `details` | TEXT | - | NULL | 详细信息（JSON） |
| `status` | TEXT | NOT NULL | - | 操作状态（SUCCESS, FAILURE） |
| `ip_address` | TEXT | - | NULL | IP 地址 |
| `user_agent` | TEXT | - | NULL | User Agent |

**索引**:
- `idx_audit_logs_timestamp` - 时间戳查询
- `idx_audit_logs_user_id` - 用户查询
- `idx_audit_logs_action` - 操作动作查询
- `idx_audit_logs_resource_type_id` - 资源查询（复合索引）
- `idx_audit_logs_status` - 状态过滤
- `idx_audit_logs_actor_id_type` - 操作者查询（复合索引）
- `idx_audit_logs_user_id_timestamp` - 用户时间查询（复合索引）

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`

**业务规则**:
- 所有关键操作必须记录审计日志
- `details` 字段存储操作详情（JSON 格式）
- 定期归档旧日志（保留 90 天或更长）

---

#### 4.3.2 `password_histories` - 密码历史表

存储用户的历史密码（防止重复使用）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 记录 ID（CUID） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `password_hash` | TEXT | NOT NULL | - | 密码哈希值（bcrypt） |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |

**索引**:
- `idx_password_histories_user_id_created_at` - 用户历史查询（复合索引）

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**业务规则**:
- 密码修改时记录历史密码
- 防止用户重复使用最近 N 次的密码（默认 5 次）
- 仅保留最近 N 条记录（节省空间）

---

#### 4.3.3 `password_reset_requests` - 密码重置请求表

存储密码重置请求（找回密码功能）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 请求 ID（CUID） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `token` | TEXT | UNIQUE NOT NULL | - | 重置令牌（随机生成） |
| `expires_at` | DATETIME | NOT NULL | - | 过期时间 |
| `is_used` | INTEGER | - | 0 | 是否已使用 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `used_at` | DATETIME | - | NULL | 使用时间 |

**索引**:
- `idx_password_reset_requests_user_id` - 用户查询
- `idx_password_reset_requests_token` - 令牌查询
- `idx_password_reset_requests_expires_at` - 过期时间查询
- `idx_password_reset_requests_is_used` - 使用状态查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**业务规则**:
- 重置令牌有效期默认 1 小时
- 重置令牌仅能使用一次（`is_used` 标记）
- 定期清理过期和已使用的请求

---

### 4.4 OAuth Scopes

#### 4.4.1 `scopes` - 权限范围表

存储 OAuth 2.1 和 OpenID Connect 的权限范围定义。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | Scope ID（CUID） |
| `name` | TEXT | UNIQUE NOT NULL | - | Scope 名称（唯一标识） |
| `description` | TEXT | - | NULL | Scope 描述 |
| `is_public` | INTEGER | - | 0 | 是否公开（用户可直接请求） |
| `is_oidc_scope` | INTEGER | - | 0 | 是否 OIDC 标准 Scope |
| `is_active` | INTEGER | - | 1 | 是否激活 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**业务规则**:
- OIDC 标准 Scope：`openid`, `profile`, `email`, `phone`, `address`
- 自定义 Scope 需要设置 `is_public = 0`（需要显式授权）

**默认 Scopes**:
- `openid` - OpenID Connect 基础 Scope
- `profile` - 用户资料信息
- `email` - 用户邮箱
- `phone` - 用户电话
- `address` - 用户地址

---

#### 4.4.2 `scope_permissions` - Scope 权限关联表

存储 Scope 和权限的多对多关系。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `scope_id` | TEXT | NOT NULL, FK | - | Scope ID（外键） |
| `permission_id` | TEXT | NOT NULL, FK | - | 权限 ID（外键） |
| `assigned_at` | DATETIME | - | CURRENT_TIMESTAMP | 分配时间 |

**约束**:
- `PRIMARY KEY (scope_id, permission_id)` - 联合主键
- `FOREIGN KEY (scope_id) REFERENCES scopes(id) ON DELETE CASCADE`
- `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE`

**业务规则**:
- 一个 Scope 可以包含多个权限
- 用户授权 Scope 后，自动获得关联的权限

---

#### 4.4.3 `consent_grants` - 用户同意授权记录表

存储用户对特定客户端的授权同意记录。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 记录 ID（CUID） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `client_id` | TEXT | NOT NULL, FK | - | 客户端 ID（外键） |
| `scopes` | TEXT | NOT NULL | - | 授权的 Scopes（JSON 数组） |
| `issued_at` | DATETIME | - | CURRENT_TIMESTAMP | 授权时间 |
| `expires_at` | DATETIME | - | NULL | 过期时间 |
| `revoked_at` | DATETIME | - | NULL | 撤销时间 |

**约束**:
- `UNIQUE (user_id, client_id)` - 唯一约束（用户+客户端）
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- `FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE`

**业务规则**:
- 用户同意授权后，下次访问同一客户端无需再次同意（除非 Scope 变化）
- 用户可以撤销授权（设置 `revoked_at`）
- 授权可以设置过期时间（`expires_at`）

---

### 4.5 安全相关

#### 4.5.1 `revoked_auth_jtis` - 已撤销的 JWT ID 表

存储已撤销的 JWT 令牌 ID（用于令牌撤销）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `jti` | TEXT | PRIMARY KEY | - | JWT ID（唯一标识） |
| `user_id` | TEXT | NOT NULL, FK | - | 用户 ID（外键） |
| `type` | TEXT | NOT NULL | - | 令牌类型（ACCESS, REFRESH） |
| `expires_at` | DATETIME | NOT NULL | - | 原始令牌过期时间 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 撤销时间 |

**索引**:
- `idx_revoked_auth_jtis_user_id` - 用户查询
- `idx_revoked_auth_jtis_expires_at` - 过期时间查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**业务规则**:
- 令牌撤销后，将 `jti` 加入黑名单
- 验证令牌时检查 `jti` 是否在黑名单中
- 定期清理已过期的撤销记录

---

#### 4.5.2 `login_attempts` - 登录尝试记录表

存储所有登录尝试记录（成功和失败）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 记录 ID（CUID） |
| `user_id` | TEXT | FK | NULL | 用户 ID（外键，可为空） |
| `username` | TEXT | NOT NULL | - | 用户名 |
| `ip_address` | TEXT | - | NULL | IP 地址 |
| `user_agent` | TEXT | - | NULL | User Agent |
| `timestamp` | DATETIME | - | CURRENT_TIMESTAMP | 时间戳 |
| `successful` | INTEGER | NOT NULL | - | 是否成功（1=成功，0=失败） |
| `failure_reason` | TEXT | - | NULL | 失败原因 |
| `mfa_attempted` | INTEGER | - | 0 | 是否尝试 MFA |
| `mfa_successful` | INTEGER | - | NULL | MFA 是否成功 |

**索引**:
- `idx_login_attempts_user_id` - 用户查询
- `idx_login_attempts_username` - 用户名查询
- `idx_login_attempts_ip_address` - IP 地址查询
- `idx_login_attempts_timestamp` - 时间戳查询

**外键**:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`

**业务规则**:
- 所有登录尝试必须记录（成功和失败）
- 失败次数达到阈值后锁定账户（默认 5 次）
- 锁定时长默认 15 分钟
- 定期清理旧记录（保留 30 天）

---

#### 4.5.3 `system_configurations` - 系统配置表

存储系统配置参数（可动态修改）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 配置 ID（CUID） |
| `key` | TEXT | UNIQUE NOT NULL | - | 配置键（唯一标识） |
| `value` | TEXT | NOT NULL | - | 配置值（JSON） |
| `description` | TEXT | - | NULL | 配置描述 |
| `type` | TEXT | - | 'string' | 值类型（string, number, boolean, json） |
| `is_editable` | INTEGER | - | 1 | 是否可编辑 |
| `is_sensitive` | INTEGER | - | 0 | 是否敏感（不显示） |
| `category` | TEXT | - | NULL | 配置分类 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**业务规则**:
- 敏感配置（`is_sensitive = 1`）不返回给客户端
- 不可编辑配置（`is_editable = 0`）仅系统管理员可修改

**默认配置**:
- `system.name` - 系统名称
- `system.version` - 系统版本
- `auth.token.access_ttl` - 访问令牌有效期
- `auth.token.refresh_ttl` - 刷新令牌有效期
- `security.password.min_length` - 密码最小长度
- `security.password.require_uppercase` - 密码要求大写字母
- `security.password.require_number` - 密码要求数字
- `security.login.max_attempts` - 最大失败登录次数
- `security.login.lockout_duration` - 锁定时长

---

#### 4.5.4 `security_policies` - 安全策略表

存储安全策略定义（密码策略、登录策略等）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 策略 ID（CUID） |
| `name` | TEXT | UNIQUE NOT NULL | - | 策略名称 |
| `type` | TEXT | NOT NULL | - | 策略类型（PASSWORD, LOGIN, TOKEN） |
| `policy` | TEXT | NOT NULL | - | 策略内容（JSON） |
| `description` | TEXT | - | NULL | 策略描述 |
| `is_active` | INTEGER | - | 1 | 是否激活 |
| `is_default` | INTEGER | - | 0 | 是否默认策略 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | - | CURRENT_TIMESTAMP | 更新时间 |

**索引**:
- `idx_security_policies_name_type` - 名称和类型查询（复合索引）
- `idx_security_policies_type_active_default` - 类型、激活、默认查询（复合索引）

**业务规则**:
- 同一类型只能有一个默认策略（`is_default = 1`）
- `policy` 字段存储 JSON 格式的策略详情

---

#### 4.5.5 `token_blacklist` - 令牌黑名单表

通用令牌撤销黑名单（统一管理所有类型令牌）。

**字段列表**:

| 字段名 | 类型 | 约束 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `id` | TEXT | PRIMARY KEY | - | 记录 ID（CUID） |
| `jti` | TEXT | UNIQUE NOT NULL | - | JWT ID（唯一标识） |
| `token_type` | TEXT | NOT NULL | - | 令牌类型（ACCESS, REFRESH, AUTHORIZATION） |
| `user_id` | TEXT | - | NULL | 用户 ID |
| `client_id` | TEXT | - | NULL | 客户端 ID |
| `expires_at` | DATETIME | NOT NULL | - | 原始令牌过期时间 |
| `reason` | TEXT | - | NULL | 撤销原因 |
| `created_at` | DATETIME | - | CURRENT_TIMESTAMP | 撤销时间 |

**索引**:
- `idx_token_blacklist_jti` - JWT ID 查询
- `idx_token_blacklist_expires_at` - 过期时间查询
- `idx_token_blacklist_user_id` - 用户查询
- `idx_token_blacklist_client_id` - 客户端查询

**业务规则**:
- 令牌撤销后，将 `jti` 加入黑名单
- 验证令牌时检查 `jti` 是否在黑名单中
- 定期清理已过期的撤销记录

---

## 5. 关系图

### 5.1 核心关系图

```
users ──┬── user_roles ──── roles ──── role_permissions ──── permissions
        │                                                         │
        │                                                    api_permissions
        │                                                    menu_permissions
        │                                                    data_permissions
        │
        ├── authorization_codes ──── oauth_clients ──┬── client_redirect_uris
        │                                            ├── client_grant_types
        ├── access_tokens ───────────────────────────┼── client_response_types
        │                                            ├── client_allowed_scopes
        ├── refresh_tokens ──────────────────────────┼── client_permissions
        │                                            └── client_ip_whitelist
        ├── consent_grants
        │
        ├── audit_logs
        ├── password_histories
        ├── password_reset_requests
        ├── revoked_auth_jtis
        └── login_attempts
```

### 5.2 外键关系总结

| 表名 | 外键字段 | 引用表 | 级联操作 |
|------|----------|--------|----------|
| `authorization_codes` | `user_id` | `users` | ON DELETE CASCADE |
| `authorization_codes` | `client_id` | `oauth_clients` | ON DELETE CASCADE |
| `access_tokens` | `user_id` | `users` | ON DELETE CASCADE |
| `access_tokens` | `client_id` | `oauth_clients` | ON DELETE CASCADE |
| `refresh_tokens` | `user_id` | `users` | ON DELETE CASCADE |
| `refresh_tokens` | `client_id` | `oauth_clients` | ON DELETE CASCADE |
| `user_roles` | `user_id` | `users` | ON DELETE CASCADE |
| `user_roles` | `role_id` | `roles` | ON DELETE CASCADE |
| `role_permissions` | `role_id` | `roles` | ON DELETE CASCADE |
| `role_permissions` | `permission_id` | `permissions` | ON DELETE CASCADE |
| `api_permissions` | `permission_id` | `permissions` | ON DELETE CASCADE |
| `menu_permissions` | `permission_id` | `permissions` | ON DELETE CASCADE |
| `data_permissions` | `permission_id` | `permissions` | ON DELETE CASCADE |
| `menus` | `parent_id` | `menus` | - |
| `scope_permissions` | `scope_id` | `scopes` | ON DELETE CASCADE |
| `scope_permissions` | `permission_id` | `permissions` | ON DELETE CASCADE |
| `consent_grants` | `user_id` | `users` | ON DELETE CASCADE |
| `consent_grants` | `client_id` | `oauth_clients` | ON DELETE CASCADE |
| `audit_logs` | `user_id` | `users` | ON DELETE SET NULL |
| `password_histories` | `user_id` | `users` | ON DELETE CASCADE |
| `password_reset_requests` | `user_id` | `users` | ON DELETE CASCADE |
| `revoked_auth_jtis` | `user_id` | `users` | ON DELETE CASCADE |
| `login_attempts` | `user_id` | `users` | ON DELETE SET NULL |
| `client_*` (6 tables) | `client_id` | `oauth_clients` | ON DELETE CASCADE |

---

## 6. 索引策略

### 6.1 索引设计原则

- ✅ **主键自动索引** - SQLite 自动为主键创建索引
- ✅ **唯一约束自动索引** - SQLite 自动为 UNIQUE 字段创建索引
- ✅ **外键查询索引** - 所有外键字段建立索引
- ✅ **高频查询字段索引** - 经常用于 WHERE、JOIN、ORDER BY 的字段
- ✅ **复合索引** - 多字段组合查询建立复合索引
- ⚠️ **避免过度索引** - 每个索引增加写入开销，需权衡

### 6.2 关键索引列表

**认证核心模型**:
- `users`: username, is_active, organization, department
- `oauth_clients`: client_id, is_active, client_type, (client_id + is_active)
- `authorization_codes`: code, user_id, client_id, expires_at, is_used
- `access_tokens`: token_hash, jti, user_id, client_id, expires_at
- `refresh_tokens`: token_hash, jti, user_id, client_id, expires_at, is_revoked

**权限管理核心**:
- `roles`: name, is_active
- `permissions`: name, resource, action, type, is_active
- `api_permissions`: http_method, endpoint
- `menu_permissions`: menu_id
- `data_permissions`: table_name, column_name
- `menus`: key, parent_id, order, is_active
- `user_roles`: expires_at

**审计与监控**:
- `audit_logs`: timestamp, user_id, action, (resource_type + resource_id), status, (actor_id + actor_type), (user_id + timestamp)
- `password_histories`: (user_id + created_at)
- `password_reset_requests`: user_id, token, expires_at, is_used
- `login_attempts`: user_id, username, ip_address, timestamp

**安全相关**:
- `revoked_auth_jtis`: user_id, expires_at
- `security_policies`: (name + type), (type + is_active + is_default)
- `token_blacklist`: jti, expires_at, user_id, client_id

---

## 7. 种子数据

### 7.1 演示用户

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| `admin` | `admin123` | `super_admin` | 超级管理员 |
| `demo` | `admin123` | `user` | 普通用户 |

### 7.2 OAuth 客户端

#### Admin Portal 客户端

| 字段 | 值 |
|------|-----|
| `client_id` | `auth-center-admin-client` |
| `client_secret` | （占位符，生产环境需更改） |
| `name` | `Admin Portal` |
| `client_type` | `CONFIDENTIAL` |
| `require_pkce` | `true` |
| `require_consent` | `true` |
| `redirect_uris` | `http://localhost:3002/auth/callback`<br>`http://localhost:6188/auth/callback`<br>`https://admin.example.com/auth/callback` |
| `grant_types` | `authorization_code`, `refresh_token` |
| `scopes` | `openid`, `profile`, `email`, `admin`, `manage_users`, `manage_roles`, `manage_clients`, `audit`, `system_config` |

#### Test Client（仅开发）

| 字段 | 值 |
|------|-----|
| `client_id` | `test-client` |
| `client_type` | `PUBLIC` |
| `require_pkce` | `false` |
| `require_consent` | `false` |

### 7.3 默认角色

| 角色 | 显示名称 | 权限数 | 说明 |
|------|---------|-------|------|
| `super_admin` | 超级管理员 | 所有权限 | 完整系统权限 |
| `admin` | 管理员 | 大部分权限 | 除用户删除外的所有权限 |
| `user` | 普通用户 | 基本权限 | 查看用户、角色、权限 |

### 7.4 默认权限

权限按资源分类：

**用户管理** (`users:*`):
- `users:list` - 查看用户列表
- `users:create` - 创建用户
- `users:read` - 查看用户详情
- `users:update` - 更新用户
- `users:delete` - 删除用户

**角色管理** (`roles:*`):
- `roles:list` - 查看角色列表
- `roles:create` - 创建角色
- `roles:update` - 更新角色
- `roles:delete` - 删除角色

**权限管理** (`permissions:*`):
- `permissions:list` - 查看权限列表
- `permissions:manage` - 管理权限

**客户端管理** (`clients:*`):
- `clients:list` - 查看客户端列表
- `clients:create` - 创建客户端
- `clients:update` - 更新客户端
- `clients:delete` - 删除客户端

**审计日志** (`audit:*`):
- `audit:list` - 查看审计日志
- `audit:export` - 导出审计日志

**系统配置** (`system:*`):
- `system:config:read` - 查看系统配置
- `system:config:edit` - 编辑系统配置

**菜单权限** (`menu:*`):
- `menu:system:user:view` - 用户管理菜单
- `menu:system:role:view` - 角色管理菜单
- `menu:system:permission:view` - 权限管理菜单
- `menu:system:client:view` - 客户端管理菜单
- `menu:system:audit:view` - 审计日志菜单

**Dashboard**:
- `dashboard:view` - 查看 Dashboard

### 7.5 默认菜单

```
系统管理
├── 用户管理 (/admin/users)
├── 角色管理 (/admin/system/roles)
├── 权限管理 (/admin/system/permissions)
├── 客户端管理 (/admin/system/clients)
└── 审计日志 (/admin/system/audits)
```

### 7.6 默认系统配置

| 配置键 | 值 | 类型 | 分类 |
|--------|-----|------|------|
| `system.name` | `"Authentication Center"` | string | general |
| `system.version` | `"1.0.0"` | string | general |
| `auth.token.access_ttl` | `3600` | number | auth |
| `auth.token.refresh_ttl` | `2592000` | number | auth |
| `security.password.min_length` | `8` | number | security |
| `security.password.require_uppercase` | `true` | boolean | security |
| `security.password.require_number` | `true` | boolean | security |
| `security.login.max_attempts` | `5` | number | security |
| `security.login.lockout_duration` | `900` | number | security |

---

## 8. 迁移脚本说明

### 8.1 脚本执行顺序

| 脚本 | 功能 | 说明 |
|------|------|------|
| `001_initial_schema.sql` | 创建所有表结构和索引 | **必须首先执行** |
| `002_seed_data.sql` | 插入种子数据 | 在 001 后执行 |
| `003_init_admin_portal_client.sql` | 初始化 Admin Portal 客户端 | 可选，002 已包含基本配置 |
| `004_clean_initialization.sql` | 清理和 E2E 测试初始化 | 可选，仅用于测试环境 |

### 8.2 脚本说明

#### `001_initial_schema.sql` - 基础表结构

- 创建所有表（32 张表）
- 定义外键约束
- 创建索引（50+ 个索引）
- **不包含数据**

**执行时机**: 数据库初始化时

---

#### `002_seed_data.sql` - 种子数据

- 演示用户（admin, demo）
- OAuth 客户端（Admin Portal, Test Client）
- 客户端配置（重定向 URI、授权类型、响应类型、Scopes）
- 角色和权限（RBAC 初始化）
- 用户角色关联
- 菜单
- 系统配置

**执行时机**: 001 执行后

---

#### `003_init_admin_portal_client.sql` - Admin Portal 详细配置

- 创建或更新 Admin Portal OAuth 客户端
- 详细的重定向 URI 配置（开发、生产环境）
- 自定义 Scopes（admin, manage_users, manage_roles 等）
- 客户端权限配置
- IP 白名单（localhost）

**执行时机**: 可选，002 已包含基本配置，此脚本提供更详细的配置

**注意**:
- 生产环境需修改 `client_secret`
- 更新重定向 URI 为生产域名
- 设置 `require_https_redirect = true`

---

#### `004_clean_initialization.sql` - E2E 测试初始化

- 创建测试用 admin 用户（如果不存在）
- 创建测试用 Admin Portal 客户端（如果不存在）
- 简化的客户端配置

**执行时机**: E2E 测试前，确保数据库处于已知状态

**注意**:
- 使用 `INSERT OR IGNORE` 防止重复插入
- 仅用于测试环境

---

### 8.3 生产环境部署检查清单

✅ **安全配置**:
- [ ] 修改所有默认密码（admin 用户）
- [ ] 修改 OAuth 客户端 `client_secret`（生成安全的随机值）
- [ ] 更新重定向 URI 为生产域名
- [ ] 启用 `require_https_redirect = true`
- [ ] 配置 IP 白名单（如需）
- [ ] 禁用测试客户端（`test-client`）

✅ **数据库优化**:
- [ ] 定期清理过期令牌（定时任务）
- [ ] 定期归档审计日志（保留 90 天）
- [ ] 定期清理登录尝试记录（保留 30 天）
- [ ] 数据库备份策略

✅ **监控与审计**:
- [ ] 启用审计日志记录
- [ ] 配置日志轮转
- [ ] 设置告警（失败登录、异常操作）

---

## 9. 安全考虑

### 9.1 密码安全

- ✅ **Bcrypt 加密**: 密码使用 bcrypt 加密（成本因子 ≥ 12）
- ✅ **密码历史**: 防止重复使用最近 5 次密码
- ✅ **密码策略**: 最小长度 8 位，要求大写字母和数字
- ✅ **密码重置**: 重置令牌有效期 1 小时，仅能使用一次

### 9.2 令牌安全

- ✅ **PKCE 强制**: 授权码流程强制使用 PKCE（S256 方法）
- ✅ **令牌哈希**: 生产环境仅存储令牌哈希，不存储明文
- ✅ **令牌撤销**: 支持令牌撤销（黑名单机制）
- ✅ **令牌轮换**: 刷新令牌支持轮换（Token Rotation）
- ✅ **短有效期**: 访问令牌 1 小时，授权码 10 分钟

### 9.3 认证安全

- ✅ **登录限流**: 5 次失败后锁定 15 分钟
- ✅ **HTTPS Only**: 生产环境强制 HTTPS
- ✅ **严格重定向**: 严格验证重定向 URI
- ✅ **IP 白名单**: 支持客户端 IP 白名单
- ✅ **会话管理**: 支持会话过期和并发控制

### 9.4 审计安全

- ✅ **完整审计**: 所有关键操作记录审计日志
- ✅ **不可篡改**: 审计日志仅追加，不可修改
- ✅ **详细信息**: 记录 IP、User Agent、操作详情
- ✅ **定期归档**: 审计日志定期归档

### 9.5 数据安全

- ✅ **敏感字段**: 标记敏感配置，限制访问
- ✅ **外键约束**: 确保引用完整性
- ✅ **软删除**: 关键数据支持逻辑删除
- ✅ **数据备份**: 定期备份数据库

---

## 10. 性能优化

### 10.1 查询优化

- ✅ **索引覆盖**: 高频查询字段建立索引
- ✅ **复合索引**: 多字段组合查询使用复合索引
- ✅ **避免全表扫描**: 所有查询使用索引
- ✅ **分页查询**: 列表查询使用 LIMIT/OFFSET

### 10.2 数据清理

- ✅ **定期清理过期令牌** - 建议每小时清理
- ✅ **定期清理过期授权码** - 建议每 10 分钟清理
- ✅ **定期归档审计日志** - 建议每月归档（保留 90 天）
- ✅ **定期清理登录尝试** - 建议每天清理（保留 30 天）

**清理脚本示例**:

```sql
-- 清理过期访问令牌
DELETE FROM access_tokens WHERE expires_at < datetime('now');

-- 清理过期刷新令牌
DELETE FROM refresh_tokens WHERE expires_at < datetime('now') AND is_revoked = 1;

-- 清理过期授权码
DELETE FROM authorization_codes WHERE expires_at < datetime('now');

-- 清理过期撤销记录
DELETE FROM revoked_auth_jtis WHERE expires_at < datetime('now');
DELETE FROM token_blacklist WHERE expires_at < datetime('now');

-- 清理旧登录尝试记录（保留 30 天）
DELETE FROM login_attempts WHERE timestamp < datetime('now', '-30 days');

-- 归档旧审计日志（保留 90 天，实际应导出后删除）
DELETE FROM audit_logs WHERE timestamp < datetime('now', '-90 days');
```

### 10.3 SQLite 优化

```sql
-- 启用 WAL 模式（提高并发性能）
PRAGMA journal_mode = WAL;

-- 设置缓存大小（默认 2MB，可根据内存调整）
PRAGMA cache_size = -64000; -- 64MB

-- 启用外键约束
PRAGMA foreign_keys = ON;

-- 分析统计信息（优化查询计划）
ANALYZE;
```

---

## 11. 维护与监控

### 11.1 日常维护

**每日**:
- 检查数据库大小
- 检查失败登录次数
- 检查审计日志异常

**每周**:
- 清理过期令牌
- 清理登录尝试记录
- 数据库备份

**每月**:
- 归档审计日志
- 分析查询性能
- 优化数据库（VACUUM）

### 11.2 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 数据库大小 | 磁盘占用 | > 80% |
| 失败登录次数 | 异常登录尝试 | > 100/小时 |
| 令牌撤销数量 | 异常令牌撤销 | > 1000/小时 |
| 审计日志增长 | 日志增长速度 | > 10000/小时 |
| 查询响应时间 | 数据库性能 | > 100ms |

### 11.3 备份策略

- ✅ **全量备份**: 每天凌晨 2:00
- ✅ **增量备份**: 每 4 小时（使用 WAL）
- ✅ **备份保留**: 全量备份保留 30 天，增量备份保留 7 天
- ✅ **异地备份**: 备份文件上传到云存储

**备份脚本示例**:

```bash
#!/bin/bash
# 备份脚本

DB_PATH="/path/to/database.db"
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 全量备份
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/backup_$DATE.db'"

# 压缩备份
gzip "$BACKUP_DIR/backup_$DATE.db"

# 删除 30 天前的备份
find "$BACKUP_DIR" -name "backup_*.db.gz" -mtime +30 -delete
```

---

## 附录 A: 完整表列表

| 序号 | 表名 | 分类 | 说明 |
|------|------|------|------|
| 1 | `users` | 认证核心 | 用户表 |
| 2 | `oauth_clients` | 认证核心 | OAuth 客户端表 |
| 3 | `client_redirect_uris` | 认证核心 | 客户端重定向 URI |
| 4 | `client_grant_types` | 认证核心 | 客户端授权类型 |
| 5 | `client_response_types` | 认证核心 | 客户端响应类型 |
| 6 | `client_allowed_scopes` | 认证核心 | 客户端允许权限范围 |
| 7 | `client_permissions` | 认证核心 | 客户端权限 |
| 8 | `client_ip_whitelist` | 认证核心 | 客户端 IP 白名单 |
| 9 | `authorization_codes` | 认证核心 | 授权码表 |
| 10 | `access_tokens` | 认证核心 | 访问令牌表 |
| 11 | `refresh_tokens` | 认证核心 | 刷新令牌表 |
| 12 | `roles` | 权限管理 | 角色表 |
| 13 | `permissions` | 权限管理 | 权限表 |
| 14 | `api_permissions` | 权限管理 | API 权限详细信息 |
| 15 | `menu_permissions` | 权限管理 | 菜单权限详细信息 |
| 16 | `data_permissions` | 权限管理 | 数据权限详细信息 |
| 17 | `menus` | 权限管理 | 菜单表 |
| 18 | `user_roles` | 权限管理 | 用户角色关联 |
| 19 | `role_permissions` | 权限管理 | 角色权限关联 |
| 20 | `scopes` | OAuth Scopes | 权限范围表 |
| 21 | `scope_permissions` | OAuth Scopes | Scope 权限关联 |
| 22 | `consent_grants` | OAuth Scopes | 用户同意授权记录 |
| 23 | `audit_logs` | 审计监控 | 审计日志表 |
| 24 | `password_histories` | 审计监控 | 密码历史表 |
| 25 | `password_reset_requests` | 审计监控 | 密码重置请求表 |
| 26 | `login_attempts` | 安全 | 登录尝试记录表 |
| 27 | `revoked_auth_jtis` | 安全 | 已撤销的 JWT ID |
| 28 | `token_blacklist` | 安全 | 令牌黑名单表 |
| 29 | `system_configurations` | 安全 | 系统配置表 |
| 30 | `security_policies` | 安全 | 安全策略表 |

**总计**: 30 张表（不含客户端关联表）

---

## 附录 B: 字段命名词汇表

| 英文 | 中文 | 说明 |
|------|------|------|
| `id` | ID | 主键 |
| `username` | 用户名 | 登录凭证 |
| `password_hash` | 密码哈希 | Bcrypt 加密后的密码 |
| `is_active` | 是否激活 | 布尔值（0/1） |
| `created_at` | 创建时间 | 时间戳 |
| `updated_at` | 更新时间 | 时间戳 |
| `expires_at` | 过期时间 | 时间戳 |
| `client_id` | 客户端 ID | OAuth 客户端标识 |
| `client_secret` | 客户端密钥 | 机密客户端密钥 |
| `redirect_uri` | 重定向 URI | OAuth 回调地址 |
| `grant_type` | 授权类型 | OAuth 授权方式 |
| `response_type` | 响应类型 | OAuth 响应方式 |
| `scope` | 权限范围 | OAuth Scope |
| `token` | 令牌 | 访问令牌/刷新令牌 |
| `token_hash` | 令牌哈希 | 令牌的哈希值 |
| `jti` | JWT ID | JWT 令牌唯一标识 |
| `code` | 授权码 | OAuth 授权码 |
| `code_challenge` | PKCE 挑战值 | PKCE 验证码 |
| `code_verifier` | PKCE 验证器 | PKCE 原始值 |
| `nonce` | 随机数 | OIDC 防重放参数 |
| `is_revoked` | 是否已撤销 | 令牌撤销标记 |
| `is_used` | 是否已使用 | 授权码使用标记 |

---

## 附录 C: 常见查询示例

### C.1 用户认证

```sql
-- 验证用户凭证
SELECT id, username, password_hash, is_active, must_change_password
FROM users
WHERE username = ? AND is_active = 1;

-- 记录登录尝试
INSERT INTO login_attempts (user_id, username, ip_address, user_agent, successful, failure_reason)
VALUES (?, ?, ?, ?, ?, ?);

-- 更新最后登录时间
UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?;
```

### C.2 OAuth 授权流程

```sql
-- 验证客户端
SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1;

-- 验证重定向 URI
SELECT uri FROM client_redirect_uris WHERE client_id = ? AND uri = ?;

-- 生成授权码
INSERT INTO authorization_codes (id, code, user_id, client_id, redirect_uri, scope, expires_at, code_challenge, code_challenge_method)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

-- 验证授权码
SELECT * FROM authorization_codes WHERE code = ? AND expires_at > CURRENT_TIMESTAMP AND is_used = 0;

-- 标记授权码已使用
UPDATE authorization_codes SET is_used = 1 WHERE code = ?;

-- 生成访问令牌
INSERT INTO access_tokens (id, token_hash, jti, user_id, client_id, scope, expires_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- 生成刷新令牌
INSERT INTO refresh_tokens (id, token_hash, jti, user_id, client_id, scope, expires_at)
VALUES (?, ?, ?, ?, ?, ?, ?);
```

### C.3 权限检查

```sql
-- 获取用户所有权限
SELECT DISTINCT p.name, p.resource, p.action, p.type
FROM permissions p
JOIN role_permissions rp ON p.id = rp.permission_id
JOIN user_roles ur ON rp.role_id = ur.role_id
WHERE ur.user_id = ? AND p.is_active = 1
  AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP);

-- 检查用户是否拥有特定权限
SELECT COUNT(*) > 0 AS has_permission
FROM permissions p
JOIN role_permissions rp ON p.id = rp.permission_id
JOIN user_roles ur ON rp.role_id = ur.role_id
WHERE ur.user_id = ? AND p.name = ? AND p.is_active = 1;
```

### C.4 令牌验证

```sql
-- 验证访问令牌
SELECT * FROM access_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP;

-- 验证刷新令牌
SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP AND is_revoked = 0;

-- 检查令牌是否被撤销
SELECT COUNT(*) > 0 AS is_revoked FROM token_blacklist WHERE jti = ?;
```

### C.5 审计查询

```sql
-- 查询用户操作日志
SELECT * FROM audit_logs
WHERE user_id = ?
ORDER BY timestamp DESC
LIMIT 100;

-- 查询失败的操作
SELECT * FROM audit_logs
WHERE status = 'FAILURE' AND timestamp > datetime('now', '-1 day')
ORDER BY timestamp DESC;

-- 查询特定资源的操作
SELECT * FROM audit_logs
WHERE resource_type = ? AND resource_id = ?
ORDER BY timestamp DESC;
```

---

## 文档修订历史

| 版本 | 日期 | 作者 | 说明 |
|------|------|------|------|
| 1.0 | 2025-11-13 | OAuth Service Rust Team | 初始版本 |

---

**文档完整性声明**: 本文档基于 `/home/user/ts-next/apps/oauth-service-rust/migrations/` 目录下的所有 SQL 迁移文件生成，完整反映了数据库设计的当前状态（版本 2.0）。
