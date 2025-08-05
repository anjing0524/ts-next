# OAuth 2.1 端点设计

## 标准端点

### /oauth/authorize (GET)
**功能**: 授权端点，启动OAuth流程

**参数**:
- `response_type`: 必须为 "code"
- `client_id`: 客户端标识
- `redirect_uri`: 重定向地址
- `scope`: 请求的权限范围
- `state`: CSRF防护
- `code_challenge`: PKCE挑战码
- `code_challenge_method`: 必须为 "S256"

**流程**:
1. 验证所有参数
2. 检查客户端有效性
3. 验证用户认证状态
4. 检查是否需要用户授权
5. 生成授权码
6. 重定向到客户端回调地址

### /oauth/token (POST)
**功能**: 令牌端点，交换访问令牌

**支持的grant_type**:
- `authorization_code`: 授权码流程
- `client_credentials`: 客户端凭证
- `refresh_token`: 刷新令牌

**响应**:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJ...",
  "scope": "openid profile admin:read"
}
```

### /oauth/userinfo (GET)
**功能**: 获取用户信息

**响应**:
```json
{
  "sub": "user123",
  "name": "John Doe",
  "email": "john@example.com",
  "roles": ["USER_ADMIN"],
  "permissions": ["user:list", "user:create"]
}
```

### /oauth/revoke (POST)
**功能**: 撤销令牌

### /oauth/introspect (POST)
**功能**: 令牌验证

### /.well-known/jwks.json (GET)
**功能**: JWKS公钥发现

## 管理端点

### 用户管理
- `GET /api/v2/users` - 获取用户列表
- `POST /api/v2/users` - 创建用户
- `GET /api/v2/users/{id}` - 获取用户详情
- `PUT /api/v2/users/{id}` - 更新用户
- `DELETE /api/v2/users/{id}` - 删除用户

### 角色管理
- `GET /api/v2/roles` - 获取角色列表
- `POST /api/v2/roles` - 创建角色
- `PUT /api/v2/roles/{id}` - 更新角色
- `DELETE /api/v2/roles/{id}` - 删除角色
- `GET /api/v2/roles/{id}/permissions` - 获取角色权限
- `POST /api/v2/roles/{id}/permissions` - 分配权限

### 客户端管理
- `GET /api/v2/clients` - 获取客户端列表
- `POST /api/v2/clients` - 注册客户端
- `PUT /api/v2/clients/{id}` - 更新客户端
- `DELETE /api/v2/clients/{id}` - 删除客户端
- `POST /api/v2/clients/{id}/secret` - 重置密钥

## 认证端点

### /auth/login (POST)
**功能**: 管理员登录

**请求**:
```json
{
  "username": "admin",
  "password": "password123"
}
```

### /auth/logout (POST)
**功能**: 登出

### /auth/me (GET)
**功能**: 获取当前用户信息