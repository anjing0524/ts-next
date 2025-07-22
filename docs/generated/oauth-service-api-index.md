# OAuth Service API Index (v2)

本文档为 `oauth-service` v2 版本的 API 端点提供了一个全面的索引。所有端点都以 `/api/v2` 为前缀。

**最后更新时间：2025-07-22**

## 1. 架构原则与无状态设计

### 1.1 无状态认证授权架构

本系统严格遵循 **无状态(Stateless)** 架构原则，**不依赖服务器端session存储**。所有认证状态通过以下机制管理：

- **JWT令牌**: 所有用户认证状态通过自包含的JWT令牌传递
- **客户端存储**: 令牌存储在客户端（浏览器localStorage或应用存储）
- **无服务器状态**: 服务器端不维护任何用户会话状态

### 1.2 OAuth 2.1 + OpenID Connect 实现

系统完整实现了最新的 **OAuth 2.1** 和 **OpenID Connect (OIDC)** 规范，核心特点：

- **强制PKCE**: 所有授权码流程必须使用PKCE (Proof Key for Code Exchange)
- **JWT令牌**: Access Token、Refresh Token、ID Token均采用JWT格式
- **JWKS端点**: 通过标准JWKS端点动态发布签名公钥
- **无session依赖**: 认证流程完全基于令牌，无服务器端session

### 1.3 架构分工

- **oauth-service**: 仅提供API，**不渲染任何页面**
  - 所有端点均为RESTful API接口
  - 负责令牌颁发、验证、刷新、撤销
  - 不包含任何UI页面或session管理

- **admin-portal**: 负责所有用户交互页面
  - 登录页面: `/auth/login`
  - 授权同意页面: `/oauth/consent`
  - 错误提示页面: `/error`

## 2. 核心安全最佳实践

### 2.1 密码策略

- **复杂度要求**: 所有用户密码必须满足在 `@repo/lib` 中定义的复杂度要求
- **哈希存储**: 密码使用 `bcrypt` 算法进行哈希处理
- **密码历史**: 系统记录用户近期的密码历史，防止重用旧密码

### 2.2 令牌安全与 JWKS

- **JWT签名**: 所有令牌使用RS256非对称算法签名
- **JWKS端点**: 通过 `/.well-known/jwks.json` 动态发布公钥
- **令牌生命周期**: 
  - Access Token: 15分钟
  - Refresh Token: 30天
  - ID Token: 15分钟

### 2.3 速率限制

- **全局保护**: 所有API端点默认受速率限制保护
- **精细化控制**:
  - OAuth核心端点: 基于client_id的严格限制
  - 用户相关端点: 基于用户ID的限制
  - 公共端点: 基于IP地址的限制

### 2.4 无状态优势

- **水平扩展**: 无需session共享，支持无状态水平扩展
- **故障恢复**: 服务器重启不影响已颁发的令牌
- **负载均衡**: 可部署在任意负载均衡器后，无需粘性会话

## 3. 发现与元数据 (Discovery & Metadata)

用于服务发现的标准端点。

| HTTP 方法 | 路径                                       | 功能描述                                                                        | 认证/权限 |
| :-------- | :----------------------------------------- | :------------------------------------------------------------------------------ | :-------- |
| `GET`     | `/api/v2/.well-known/openid-configuration` | 获取OpenID Connect和OAuth 2.0的元数据，包括端点URL、支持的范围和加密算法。     | 公开      |
| `GET`     | `/api/v2/.well-known/jwks.json`            | 获取用于验证JWT签名的JSON Web Key Set (JWKS)。                                 | 公开      |
| `GET`     | `/api/v2/health`                           | 检查服务的健康状态。                                                            | 公开      |

## 4. 核心OAuth 2.1流程

### 4.1 授权码流程 (Authorization Code Flow)

标准的OAuth 2.1授权码流程，**强制使用PKCE**。

| HTTP 方法 | 路径                       | 功能描述                                                                                                     | 认证/权限 |
| :-------- | :------------------------- | :----------------------------------------------------------------------------------------------------------- | :-------- |
| `GET`     | `/api/v2/oauth/authorize`  | **授权端点API**: 启动OAuth 2.1授权码流程，返回授权码。未认证用户将被重定向到admin-portal登录页面。             | 用户认证  |
| `POST`    | `/api/v2/oauth/token`      | **令牌端点**: 使用授权码交换访问令牌，支持授权码、刷新令牌、客户端凭据三种grant_type。                      | 客户端认证 |
| `GET`     | `/api/v2/oauth/consent`    | **获取同意信息API**: 为前端同意页面提供客户端信息和请求的权限范围数据。                                     | 用户认证  |
| `POST`    | `/api/v2/oauth/consent`    | **提交同意决策API**: 提交用户对授权请求的同���或拒绝决策。                                                   | 用户认证  |

### 4.2 令牌管理

| HTTP 方法 | 路径                       | 功能描述                                                                                      | 认证/权限 |
| :-------- | :------------------------- | :-------------------------------------------------------------------------------------------- | :-------- |
| `POST`    | `/api/v2/oauth/introspect` | **令牌内省**: 验证访问令牌或刷新令牌的有效性，返回令牌元数据。                                | 客户端认证 |
| `POST`    | `/api/v2/oauth/revoke`     | **令牌撤销**: 撤销访问令牌或刷新令牌，令牌加入黑名单。                                        | 客户端认证 |
| `GET`     | `/api/v2/oauth/userinfo`   | **UserInfo端点**: 使用访问令牌获取用户基本信息，符合OIDC标准。                                | Bearer令牌 |

## 5. 用户管理

基于RBAC的用户管理API。

| HTTP 方法 | 路径                             | 功能描述                                             | 认证/权限                   |
| :-------- | :------------------------------- | :--------------------------------------------------- | :-------------------------- |
| `GET`     | `/api/v2/users`                  | 列出所有用户，支持分页和过滤。                       | Bearer令牌 (`user:list`)    |
| `POST`    | `/api/v2/users`                  | 创建新用户。                                         | Bearer令牌 (`user:create`)  |
| `GET`     | `/api/v2/users/{userId}`         | 获取指定用户的详细信息。                             | Bearer令牌 (`user:read`)    |
| `PUT`     | `/api/v2/users/{userId}`         | 更新用户基本信息。                                   | Bearer令牌 (`user:update`)  |
| `DELETE`  | `/api/v2/users/{userId}`         | 删除用户。                                           | Bearer令牌 (`user:delete`)  |
| `GET`     | `/api/v2/users/me`               | 获取当前用户详细信息。                               | Bearer令牌                  |
| `PUT`     | `/api/v2/users/me/profile`       | 更新当前用户个人资料。                               | Bearer令牌                  |
| `GET`     | `/api/v2/users/{userId}/roles`   | 获取用户角色列表。                                   | Bearer令牌 (`user:read`)    |
| `PUT`     | `/api/v2/users/{userId}/roles`   | 为用户分配角色。                                     | Bearer令牌 (`user:update`)  |

## 6. 客户端管理

OAuth客户端管理API。

| HTTP 方法 | 路径                                | 功能描述                                    | 认证/权限                      |
| :-------- | :---------------------------------- | :------------------------------------------ | :----------------------------- |
| `GET`     | `/api/v2/clients`                   | 列出所有OAuth客户端。                       | Bearer令牌 (`client:list`)     |
| `POST`    | `/api/v2/clients`                   | 创建新OAuth客户端。                         | Bearer令牌 (`client:create`)   |
| `GET`     | `/api/v2/clients/{clientId}`        | 获取客户端详细信息。                        | Bearer令牌 (`client:read`)     |
| `PUT`     | `/api/v2/clients/{clientId}`        | 更新客户端配置信息。                        | Bearer令牌 (`client:update`)   |
| `DELETE`  | `/api/v2/clients/{clientId}`        | 删除客户端。                                | Bearer令牌 (`client:delete`)   |
| `POST`    | `/api/v2/clients/{clientId}/secret` | 重置客户端密钥。                            | Bearer令牌 (`client:update`)   |

## 7. 角色与权限管理 (RBAC)

基于角色的访问控制系统。

### 7.1 权限管理

| HTTP 方法 | 路径                                 | 功能描述               | 认证/权限                      |
| :-------- | :----------------------------------- | :--------------------- | :----------------------------- |
| `GET`     | `/api/v2/permissions`                | 列出所有权限定义。     | Bearer令牌 (`permission:list`) |
| `POST`    | `/api/v2/permissions`                | 创建新权限定义。       | Bearer令牌 (`permission:create`) |
| `GET`     | `/api/v2/permissions/{permissionId}` | 获取权限详情。         | Bearer令牌 (`permission:read`) |
| `PUT`     | `/api/v2/permissions/{permissionId}` | 更新权限信息。         | Bearer令牌 (`permission:update`) |
| `DELETE`  | `/api/v2/permissions/{permissionId}` | 删除权限。             | Bearer令牌 (`permission:delete`) |

### 7.2 角色管理

| HTTP 方法 | 路径                                                | 功能描述             | 认证/权限                |
| :-------- | :-------------------------------------------------- | :------------------- | :----------------------- |
| `GET`     | `/api/v2/roles`                                     | 列出所有角色。       | Bearer令牌 (`role:list`) |
| `POST`    | `/api/v2/roles`                                     | 创建新角色。         | Bearer令牌 (`role:create`) |
| `GET`     | `/api/v2/roles/{roleId}`                            | 获取角色详情。       | Bearer令牌 (`role:read`) |
| `PUT`     | `/api/v2/roles/{roleId}`                            | 更新角色信息。       | Bearer令牌 (`role:update`) |
| `DELETE`  | `/api/v2/roles/{roleId}`                            | 删除角色。           | Bearer令牌 (`role:delete`) |
| `POST`    | `/api/v2/roles/{roleId}/permissions`                | 为角色批量分配权限。 | Bearer令牌 (`role:update`) |
| `DELETE`  | `/api/v2/roles/{roleId}/permissions`                | 从角色批量移除权限。 | Bearer令牌 (`role:update`) |

## 8. 认证辅助端点

用户认证相关的辅助API。

| HTTP 方法 | 路径                           | 功能描述                           | 认证/权限   |
| :-------- | :----------------------------- | :--------------------------------- | :---------- |
| `POST`    | `/api/v2/auth/check`           | 检查用户权限。                     | Bearer令牌  |
| `POST`    | `/api/v2/auth/login`           | 用户名密码登录。                   | 公开        |
| `POST`    | `/api/v2/auth/logout`          | 用户登出（令牌失效）。             | Bearer令牌  |
| `GET`     | `/api/v2/auth/me`              | 获取当前用户信息。                 | Bearer令牌  |
| `POST`    | `/api/v2/auth/password/change` | 修改密码。                         | Bearer令牌  |
| `POST`    | `/api/v2/auth/password/forgot` | 忘记密码（发送重置邮件）。         | 公开        |
| `POST`    | `/api/v2/auth/password/reset`  | 重置密码。                         | 公开        |

## 9. 审计与日志

系统审计日志管理。

| HTTP 方法 | 路径                 | 功能描述               | 认证/权限                 |
| :-------- | :------------------- | :--------------------- | :------------------------ |
| `GET`     | `/api/v2/audit-logs` | 获取审计日志列表。     | Bearer令牌 (`audit:list`) |

## 10. 内部管理端点

| HTTP 方法 | 路径                          | 功能描述                         | 认证/权限          |
| :-------- | :---------------------------- | :------------------------------- | :----------------- |
| `POST`    | `/api/v2/revoke_token_by_jti` | 通过JTI撤销令牌（内部管理）。    | 内部Admin API Key  |
| `POST`    | `/api/v2/test-setup`          | 测试环境数据初始化。             | 仅限非生产环境     |

## 11. API使用规范

### 11.1 认证方式

1. **Bearer Token**: 在请求头中添加 `Authorization: Bearer <token>`
2. **Client Credentials**: 对于客户端认证，使用HTTP Basic Auth
3. **无状态JWT认证**: 系统采用完全无状态的JWT令牌机制，不维护服务器端session

### 11.2 令牌管理

#### JWT令牌结构
```json
{
  "sub": "user-id",
  "iss": "oauth-service",
  "aud": "client-id",
  "exp": 1234567890,
  "iat": 1234567890,
  "scope": "openid profile",
  "permissions": ["user:list", "client:read"]
}
```

#### 令牌获取流程
1. **授权码流程**: `GET /oauth/authorize` → 登录/同意 → `POST /oauth/token`
2. **客户端凭据**: `POST /oauth/token` (grant_type=client_credentials)
3. **刷新令牌**: `POST /oauth/token` (grant_type=refresh_token)

### 11.3 错误处理

系统遵循OAuth 2.1标准错误响应格式：

```json
{
  "error": "invalid_token",
  "error_description": "The access token expired",
  "error_uri": "https://tools.ietf.org/html/rfc6750#section-3.1"
}
```

### 11.4 分页参数

支持分页的端点接受以下参数：
- `page`: 页码，默认为1
- `limit`: 每页数量，默认为10，最大100
- `sort`: 排序字段和方向，如`createdAt:desc`
- `filter`: 过滤条件，如`name:admin`

### 11.5 无状态优势

- **水平扩展**: 服务实例无状态，支持水平扩展无需session共享
- **故障恢复**: 服务器重启不影响已颁发的令牌
- **负载均衡**: 可部署在任意负载均衡器后，无需粘性会话
- **云原生**: 完美适配容器化和云原生部署