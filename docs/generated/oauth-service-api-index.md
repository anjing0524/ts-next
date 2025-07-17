# OAuth Service API Index (v2)

本文档为 `oauth-service` v2 版本的 API 端点提供了一个全面的索引。所有端点都以 `/api/v2` 为前缀。

**最后更新时间：2025-07-17**

## 1. 核心安全最佳实践 (Core Security Best Practices)

`oauth-service` 的设计和实现遵循了多项安全最佳实践，以确保认证授权流程的健壮性。

### 1.1. 密码策略

- **复杂度要求**: 所有用户密码必须满足在 `@repo/lib` 中定义的复杂度要求，包括最小长度和多种字符类别（大小写字母、数字、特殊字符）的组合。
- **哈希存储**: 密码使用 `bcrypt` 算法进行哈希处理，并配置了适当的盐轮数（Salt Rounds），以防止彩虹表和暴力破解攻击。
- **密码历史**: 系统会记录用户近期的密码历史，防止用户重用旧密码。

### 1.2. 令牌安全与 JWKS

- **JWT 签名**: 所有访问令牌（Access Token）和身份令牌（ID Token）都使用 RS256 非对称算法进行签名。
- **JWKS 端点**: 服务通过 `/.well-known/jwks.json` 端点动态发布用于验证 JWT 签名的公钥。这允许客户端和资源服务器安全地、自动地获取和缓存公钥，而无需硬编码。

### 1.3. 速率限制

- **全局保护**: 所有 API 端点都默认受速率限制保护，以防止拒绝服务（DoS）攻击和暴力破解。
- **精细化控制**:
  - **OAuth 核心端点** (`/oauth/token`, `/oauth/authorize`): 采用基于客户端ID (`client_id`) 的更严格的速率限制。
  - **用户相关端点**: 采用基于用户ID的速率限制。
  - **公共端点**: 采用基于IP地址的速率限制。
- **响应头**: 被限制的请求会收到 `429 Too Many Requests` 状态码，并包含 `Retry-After` 响应头，指明何时可以重试。

### 1.4. 分布式追踪

- **可观测性**: 为了在微服务架构中实现端到端的可观测性，服务支持分布式追踪。
- **Trace ID**: 所有请求都会生成或传播一个唯一的追踪ID（`x-b3-traceid`），并记录在所有相关的日志中，便于快速定位和诊断跨服务的问题。

## 2. 发现与元数据 (Discovery & Metadata)

这些端点用于服务发现，允许客户端和开发者自动获取服务端的配置信息。

| HTTP 方法 | 路径                                       | 功能描述                                                                        | 认证/权限 |
| :-------- | :----------------------------------------- | :------------------------------------------------------------------------------ | :-------- |
| `GET`     | `/api/v2/.well-known/openid-configuration` | 获取 OpenID Connect 和 OAuth 2.0 的元数据，包括端点 URL、支持的范围和加密算法。 | 公开      |
| `GET`     | `/api/v2/.well-known/jwks.json`            | 获取用于验证 JWT 签名的 JSON Web Key Set (JWKS)。                               | 公开      |
| `GET`     | `/api/v2/health`                           | 检查服务的健康状态。                                                            | 公开      |

## 3. 核心 OAuth 2.0 流程 (Core OAuth 2.0 Flow)

这些是实现 OAuth 2.0 授权流程的核心端点。

| HTTP 方法 | 路径                       | 功能描述                                                                                                                         | 认证/权限                    |
| :-------- | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- |
| `GET`     | `/api/v2/oauth/authorize`  | **授权端点**: 用户授权的入口。验证客户端请求，检查用户登录状态和同意情况，最终重定向并附带授权码。                               | 用户会话                     |
| `POST`    | `/api/v2/oauth/token`      | **令牌端点**: 使用授权码 (`authorization_code`)、刷新令牌 (`refresh_token`) 或客户端凭据 (`client_credentials`) 来交换访问令牌。 | 客户端认证                   |
| `GET`     | `/api/v2/oauth/consent`    | **获取同意信息**: (后端 API) 为前端同意页面提供所需的数据，如客户端信息、请求的权限范围等。                                      | 用户会话                     |
| `POST`    | `/api/v2/oauth/consent`    | **提交同意决策**: (后端 API) 用户提交同意或拒绝授权的决策。                                                                      | 用户会话                     |
| `POST`    | `/api/v2/oauth/introspect` | **令牌内省**: (RFC 7662) 验证访问令牌或刷新令牌的有效性，并返回其元数据。                                                        | 客户端认证                   |
| `POST`    | `/api/v2/oauth/revoke`     | **令牌撤销**: (RFC 7009) 撤销一个访问令牌或刷新令牌。                                                                            | 客户端认证                   |
| `GET`     | `/api/v2/oauth/userinfo`   | **UserInfo 端点**: (OIDC) 使用访问令牌获取已认证用户的基本信息。                                                                 | Bearer 令牌 (`openid` scope) |

## 4. 用户管理 (User Management)

用于管理用户账户信息的端点。

| HTTP 方法 | 路径                             | 功能描述                                             | 认证/权限                   |
| :-------- | :------------------------------- | :--------------------------------------------------- | :-------------------------- |
| `GET`     | `/api/v2/users`                  | 列出所有用户，支持分页和按用户名、组织等条件过滤。   | Bearer 令牌 (`user:list`)   |
| `POST`    | `/api/v2/users`                  | 创建一个新用户。                                     | Bearer 令牌 (`user:create`) |
| `GET`     | `/api/v2/users/{userId}`         | 获取指定 ID 的单个用户的详细信息。                   | Bearer 令牌 (`user:read`)   |
| `PUT`     | `/api/v2/users/{userId}`         | 更新指定 ID 的用户的基本信息（如显示名称、组织等）。 | Bearer 令牌 (`user:update`) |
| `DELETE`  | `/api/v2/users/{userId}`         | 删除指定 ID 的用户。                                 | Bearer 令牌 (`user:delete`) |
| `GET`     | `/api/v2/users/me`               | 获取当前登录用户的详细信息。                         | Bearer 令牌                 |
| `PUT`     | `/api/v2/users/me/profile`       | 更新当前登录用户的个人资料（如显示名称、头像等）。   | Bearer 令牌                 |
| `GET`     | `/api/v2/users/{userId}/roles`   | 获取指定用户的角色列表。                             | Bearer 令牌 (`user:read`)   |
| `PUT`     | `/api/v2/users/{userId}/roles`   | 为指定用户分配角色。                                 | Bearer 令牌 (`user:update`) |

## 5. 客户端管理 (Client Management)

用于管理 OAuth 客户端（即第三方应用）的端点。

| HTTP 方法 | 路径                                | 功能描述                                                            | 认证/权限                                              |
| :-------- | :---------------------------------- | :------------------------------------------------------------------ | :----------------------------------------------------- |
| `GET`     | `/api/v2/clients`                   | 列出所有 OAuth 客户端，支持分页和按名称、类型过滤。                 | Bearer 令牌 (`client:list`)                            |
| `POST`    | `/api/v2/clients`                   | 创建一个新的 OAuth 客户端。                                         | Bearer 令牌 (`client:create`)                          |
| `GET`     | `/api/v2/clients/{clientId}`        | 获取指定 ID 的单个客户端的详细信息。                                | Bearer 令牌 (`client:read`)                            |
| `PUT`     | `/api/v2/clients/{clientId}`        | 更新指定 ID 的客户端的配置信息。                                    | Bearer 令牌 (`client:update`)                          |
| `DELETE`  | `/api/v2/clients/{clientId}`        | 删除指定 ID 的客户端。                                              | Bearer 令牌 (`client:delete`)                          |
| `POST`    | `/api/v2/clients/{clientId}/secret` | 重置指定机密客户端 (Confidential Client) 的密钥 (`client_secret`)。 | Bearer 令牌 (`client:update` 或 `client:reset_secret`) |

## 6. 角色与权限管理 (RBAC: Roles & Permissions)

用于实现基于角色的访问控制 (RBAC)。

### 6.1. 权限 (Permissions)

| HTTP 方法 | 路径                                 | 功能描述                           | 认证/权限                         |
| :-------- | :----------------------------------- | :--------------------------------- | :-------------------------------- |
| `GET`     | `/api/v2/permissions`                | 列出所有权限定义，支持分页和过滤。 | Bearer 令牌 (`permission:list`)   |
| `POST`    | `/api/v2/permissions`                | 创建一个新的权限定义。             | Bearer 令牌 (`permission:create`) |
| `GET`     | `/api/v2/permissions/{permissionId}` | 获取指定 ID 的单个权限的详细信息。 | Bearer 令牌 (`permission:read`)   |
| `PUT`     | `/api/v2/permissions/{permissionId}` | 更新指定 ID 的权限定义。           | Bearer 令牌 (`permission:update`) |
| `DELETE`  | `/api/v2/permissions/{permissionId}` | 删除指定 ID 的权限。               | Bearer 令牌 (`permission:delete`) |

### 6.2. 角色 (Roles)

| HTTP 方法 | 路径                                                | 功能描述                                             | 认证/权限                                                |
| :-------- | :-------------------------------------------------- | :--------------------------------------------------- | :------------------------------------------------------- |
| `GET`     | `/api/v2/roles`                                     | 列出所有角色，支持分页和过滤。                       | Bearer 令牌 (`role:list`)                                |
| `POST`    | `/api/v2/roles`                                     | 创建一个新角色。                                     | Bearer 令牌 (`role:create`)                              |
| `GET`     | `/api/v2/roles/{roleId}`                            | 获取指定 ID 的单个角色的详细信息，包括其关联的权限。 | Bearer 令牌 (`role:read`)                                |
| `PUT`     | `/api/v2/roles/{roleId}`                            | 更新指定 ID 的角色的基本信息（如名称、描述）。       | Bearer 令牌 (`role:update`)                              |
| `DELETE`  | `/api/v2/roles/{roleId}`                            | 删除指定 ID 的角色。                                 | Bearer 令牌 (`role:delete`)                              |
| `POST`    | `/api/v2/roles/{roleId}/permissions`                | 为指定角色批量添加一个或多个权限。                   | Bearer 令牌 (`role:update` 或 `role:manage_permissions`) |
| `DELETE`  | `/api/v2/roles/{roleId}/permissions`                | 从指定角色批量移除一个或多个权限。                   | Bearer 令牌 (`role:update` 或 `role:manage_permissions`) |
| `PUT`     | `/api/v2/roles/{roleId}/permissions/{permissionId}` | (RESTful 风格) 将单个权限关联到指定角色。            | Bearer 令牌 (`role:update` 或 `role:manage_permissions`) |
| `DELETE`  | `/api/v2/roles/{roleId}/permissions/{permissionId}` | (RESTful 风格) 从指定角色移除单个权限关联。          | Bearer 令牌 (`role:update` 或 `role:manage_permissions`) |

## 7. 范围管理 (Scope Management)

用于管理 OAuth 范围 (Scopes)。

| HTTP 方法 | 路径                       | 功能描述                              | 认证/权限                    |
| :-------- | :------------------------- | :------------------------------------ | :--------------------------- |
| `GET`     | `/api/v2/scopes`           | 列出所有 OAuth 范围，支持分页和过滤。 | Bearer 令牌 (`scope:list`)   |
| `POST`    | `/api/v2/scopes`           | 创建一个新的 OAuth 范围。             | Bearer 令牌 (`scope:create`) |
| `GET`     | `/api/v2/scopes/{scopeId}` | 获取指定 ID 的单个范围的详细信息。    | Bearer 令牌 (`scope:read`)   |
| `PUT`     | `/api/v2/scopes/{scopeId}` | 更新指定 ID 的范围信息。              | Bearer 令牌 (`scope:update`) |
| `DELETE`  | `/api/v2/scopes/{scopeId}` | 删除指定 ID 的范围。                  | Bearer 令牌 (`scope:delete`) |

## 8. 认证与授权辅助 (Auth Helpers)

| HTTP 方法 | 路径                           | 功能描述                                                         | 认证/权限   |
| :-------- | :----------------------------- | :--------------------------------------------------------------- | :---------- |
| `POST`    | `/api/v2/auth/check`           | **权限检查**: 检查当前用户的访问令牌是否具有执行特定操作的权限。 | Bearer 令牌 |
| `POST`    | `/api/v2/auth/login`           | **用户登录**: 使用用户名和密码进行登录认证。                     | 公开        |
| `POST`    | `/api/v2/auth/logout`          | **用户登出**: 清除用户会话和令牌。                               | Bearer 令牌 |
| `GET`     | `/api/v2/auth/me`              | **获取当前用户**: 获取当前登录用户的基本信息。                   | Bearer 令牌 |
| `POST`    | `/api/v2/auth/password/change` | **修改密码**: 修改当前用户的密码。                               | Bearer 令牌 |
| `POST`    | `/api/v2/auth/password/forgot` | **忘记密码**: 请求发送密码重置链接。                             | 公开        |
| `POST`    | `/api/v2/auth/password/reset`  | **重置密码**: 使用重置令牌重置用户密码。                         | 公开        |

## 9. 审计与日志 (Audit & Logs)

| HTTP 方法 | 路径                 | 功能描述                                                                    | 认证/权限                  |
| :-------- | :------------------- | :-------------------------------------------------------------------------- | :------------------------- |
| `GET`     | `/api/v2/audit-logs` | 获取审计日志，支持分页和按用户、操作等条件过滤。                            | Bearer 令牌 (`audit:list`) |

## 10. 内部管理与测试 (Internal & Testing)

| HTTP 方法 | 路径                          | 功能描述                                                                    | 认证/权限                  |
| :-------- | :---------------------------- | :-------------------------------------------------------------------------- | :------------------------- |
| `POST`    | `/api/v2/revoke_token_by_jti` | **JTI 撤销**: (内部管理) 通过 JWT ID (JTI) 将令牌加入黑名单，实现强制下线。 | 内部 Admin API Key         |
| `POST`    | `/api/v2/test-setup`          | **测试数据填充**: (仅限非生产环境) 清空并填充用于 E2E 测试的标准化数据库。 | 仅限非生产环境             |

## 11. API 使用说明

### 认证方式

1. **Bearer Token**: 在请求头中添加 `Authorization: Bearer <token>`
2. **Client Credentials**: 对于客户端认证，使用 HTTP Basic Auth 或表单参数
3. **无状态JWT认证**: 系统采用无状态JWT令牌机制，不依赖服务器端session存储

### 响应格式

所有 API 响应都遵循统一的 JSON 格式：

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功",
  "timestamp": "2025-07-17T10:30:00.000Z"
}
```

### 错误处理

错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": { ... }
  },
  "timestamp": "2025-07-17T10:30:00.000Z"
}
```

### 分页参数

支持分页的端点接受以下参数：
- `page`: 页码，默认为 1
- `limit`: 每页数量，默认为 10，最大 100
- `sort`: 排序字段和方向，如 `createdAt:desc`
- `filter`: 过滤条件，如 `name:admin`