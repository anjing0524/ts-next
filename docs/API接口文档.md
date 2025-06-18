# API文档规范

> **文档版本**: v1.0.0  
> **创建日期**: 2024-01-20  
> **最后更新**: 2024-01-20  
> **文档状态**: 正式版  
> **维护团队**: 开发团队

## 文档摘要

本文档定义了OAuth2.1认证授权中心API的设计规范、文档格式、版本管理和最佳实践，确保API的一致性、可维护性和开发者友好性。

## 目录

- [1. API设计原则](#1-api设计原则)
- [2. URL设计规范](#2-url设计规范)
- [3. HTTP方法规范](#3-http方法规范)
- [4. 请求响应格式](#4-请求响应格式)
- [5. 错误处理规范](#5-错误处理规范)
- [6. 认证授权规范](#6-认证授权规范)
- [7. 版本管理规范](#7-版本管理规范)
- [8. 文档格式规范](#8-文档格式规范)
- [9. 安全规范](#9-安全规范)
- [10. 性能规范](#10-性能规范)

## 1. API设计原则

### 1.1 核心原则

- **RESTful设计**: 遵循REST架构风格
- **一致性**: 统一的命名、格式和行为
- **可预测性**: 开发者能够预期API行为
- **向后兼容**: 保持API版本的向后兼容性
- **安全优先**: 内置安全机制和最佳实践
- **性能优化**: 考虑缓存、分页和限流

### 1.2 设计哲学

- **资源导向**: API围绕资源而非操作设计
- **无状态**: 每个请求包含所有必要信息
- **幂等性**: 相同请求多次执行结果一致
- **可发现性**: 通过HATEOAS提供API导航
- **开发者体验**: 优化开发者使用体验

## 2. URL设计规范

### 2.1 基础结构

```
https://api.example.com/v1/{resource}/{id}/{sub-resource}
```

### 2.2 命名规范

- **使用名词**: URL应该表示资源，而非动作
- **复数形式**: 集合资源使用复数名词
- **小写字母**: 全部使用小写字母
- **连字符分隔**: 使用连字符分隔多个单词
- **避免深层嵌套**: 最多3层嵌套

### 2.3 URL示例

```bash
# 正确示例
GET /api/v1/users                    # 获取用户列表
GET /api/v1/users/123                # 获取特定用户
GET /api/v1/users/123/permissions    # 获取用户权限
POST /api/v1/oauth/authorize         # OAuth授权
POST /api/v1/oauth/token             # 获取令牌

# 错误示例
GET /api/v1/getUsers                 # 动词形式
GET /api/v1/user                     # 单数形式
GET /api/v1/Users                    # 大写字母
GET /api/v1/user_permissions         # 下划线分隔
```

### 2.4 查询参数规范

```bash
# 分页参数
GET /api/v1/users?page=1&limit=20&offset=0

# 排序参数
GET /api/v1/users?sort=created_at&order=desc

# 过滤参数
GET /api/v1/users?status=active&role=admin

# 字段选择
GET /api/v1/users?fields=id,name,email

# 搜索参数
GET /api/v1/users?q=john&search_fields=name,email
```

## 3. HTTP方法规范

### 3.1 标准方法

| 方法    | 用途           | 幂等性 | 安全性 | 示例                |
| ------- | -------------- | ------ | ------ | ------------------- |
| GET     | 获取资源       | ✓      | ✓      | `GET /users/123`    |
| POST    | 创建资源       | ✗      | ✗      | `POST /users`       |
| PUT     | 完整更新资源   | ✓      | ✗      | `PUT /users/123`    |
| PATCH   | 部分更新资源   | ✗      | ✗      | `PATCH /users/123`  |
| DELETE  | 删除资源       | ✓      | ✗      | `DELETE /users/123` |
| HEAD    | 获取资源元数据 | ✓      | ✓      | `HEAD /users/123`   |
| OPTIONS | 获取支持的方法 | ✓      | ✓      | `OPTIONS /users`    |

### 3.2 方法使用指南

```bash
# GET - 获取资源
GET /api/v1/users/123
GET /api/v1/users?status=active

# POST - 创建新资源
POST /api/v1/users
Content-Type: application/json
{
  "name": "John Doe",
  "email": "john@example.com"
}

# PUT - 完整替换资源
PUT /api/v1/users/123
Content-Type: application/json
{
  "name": "John Smith",
  "email": "john.smith@example.com",
  "status": "active"
}

# PATCH - 部分更新资源
PATCH /api/v1/users/123
Content-Type: application/json
{
  "status": "inactive"
}

# DELETE - 删除资源
DELETE /api/v1/users/123
```

## 4. 请求响应格式

### 4.1 请求格式

#### 4.1.1 Content-Type

```bash
# JSON格式（推荐）
Content-Type: application/json

# 表单格式
Content-Type: application/x-www-form-urlencoded

# 文件上传
Content-Type: multipart/form-data
```

#### 4.1.2 请求头规范

```bash
# 必需头部
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json

# 可选头部
X-Request-ID: uuid-string          # 请求追踪ID
X-Client-Version: 1.0.0            # 客户端版本
User-Agent: MyApp/1.0.0             # 用户代理
Accept-Language: zh-CN,en;q=0.9     # 语言偏好
```

### 4.2 响应格式

#### 4.2.1 成功响应

```json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2024-01-20T10:00:00Z",
    "updated_at": "2024-01-20T10:00:00Z"
  },
  "meta": {
    "request_id": "req_123456789",
    "timestamp": "2024-01-20T10:00:00Z",
    "version": "v1"
  }
}
```

#### 4.2.2 列表响应

```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "name": "John Doe",
      "email": "john@example.com"
    },
    {
      "id": "124",
      "name": "Jane Smith",
      "email": "jane@example.com"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  },
  "meta": {
    "request_id": "req_123456789",
    "timestamp": "2024-01-20T10:00:00Z",
    "version": "v1"
  }
}
```

#### 4.2.3 空响应

```json
{
  "success": true,
  "data": null,
  "message": "Resource deleted successfully",
  "meta": {
    "request_id": "req_123456789",
    "timestamp": "2024-01-20T10:00:00Z",
    "version": "v1"
  }
}
```

### 4.3 响应头规范

```bash
# 标准响应头
Content-Type: application/json; charset=utf-8
X-Request-ID: req_123456789
X-Response-Time: 150ms
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400

# 缓存控制
Cache-Control: no-cache, no-store, must-revalidate
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
Last-Modified: Sat, 20 Jan 2024 10:00:00 GMT

# 安全头部
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## 5. 错误处理规范

### 5.1 HTTP状态码

| 状态码 | 含义                  | 使用场景               |
| ------ | --------------------- | ---------------------- |
| 200    | OK                    | 请求成功               |
| 201    | Created               | 资源创建成功           |
| 204    | No Content            | 请求成功但无返回内容   |
| 400    | Bad Request           | 请求参数错误           |
| 401    | Unauthorized          | 未认证或认证失败       |
| 403    | Forbidden             | 已认证但无权限         |
| 404    | Not Found             | 资源不存在             |
| 409    | Conflict              | 资源冲突               |
| 422    | Unprocessable Entity  | 请求格式正确但语义错误 |
| 429    | Too Many Requests     | 请求频率超限           |
| 500    | Internal Server Error | 服务器内部错误         |
| 502    | Bad Gateway           | 网关错误               |
| 503    | Service Unavailable   | 服务不可用             |

### 5.2 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "邮箱格式不正确"
      },
      {
        "field": "password",
        "code": "TOO_SHORT",
        "message": "密码长度至少8位"
      }
    ]
  },
  "meta": {
    "request_id": "req_123456789",
    "timestamp": "2024-01-20T10:00:00Z",
    "version": "v1"
  }
}
```

### 5.3 错误代码规范

```typescript
// 通用错误代码
export enum CommonErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// OAuth2特定错误代码
export enum OAuth2ErrorCode {
  INVALID_REQUEST = 'invalid_request',
  INVALID_CLIENT = 'invalid_client',
  INVALID_GRANT = 'invalid_grant',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE = 'unsupported_grant_type',
  INVALID_SCOPE = 'invalid_scope',
  ACCESS_DENIED = 'access_denied',
}
```

## 6. 认证授权规范

### 6.1 OAuth2.1流程

#### 6.1.1 授权码流程

```bash
# 1. 授权请求
GET /api/v1/oauth/authorize?
  response_type=code&
  client_id=your_client_id&
  redirect_uri=https://your-app.com/callback&
  scope=openid profile&
  state=random_state&
  code_challenge=challenge&
  code_challenge_method=S256

# 2. 授权响应
HTTP/1.1 302 Found
Location: https://your-app.com/callback?
  code=authorization_code&
  state=random_state

# 3. 令牌请求
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=authorization_code&
redirect_uri=https://your-app.com/callback&
client_id=your_client_id&
code_verifier=verifier

# 4. 令牌响应
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200...",
  "scope": "openid profile"
}
```

#### 6.1.2 刷新令牌流程

```bash
# 刷新令牌请求
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=def50200...&
client_id=your_client_id

# 刷新令牌响应
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200...",
  "scope": "openid profile"
}
```

### 6.2 API认证

```bash
# Bearer Token认证
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...

# API Key认证（备用方案）
X-API-Key: your_api_key

# 基础认证（仅用于客户端认证）
Authorization: Basic base64(client_id:client_secret)
```

### 6.3 权限验证

```json
{
  "user_id": "123",
  "client_id": "your_client_id",
  "scope": ["openid", "profile", "users:read"],
  "permissions": [
    {
      "resource": "users",
      "actions": ["read", "write"]
    },
    {
      "resource": "roles",
      "actions": ["read"]
    }
  ]
}
```

## 7. 版本管理规范

### 7.1 版本策略

- **URL版本控制**: `/api/v1/`, `/api/v2/`
- **语义化版本**: 主版本.次版本.修订版本
- **向后兼容**: 同一主版本内保持向后兼容
- **废弃通知**: 提前6个月通知API废弃

### 7.2 版本生命周期

```bash
# 当前支持的版本
v1.0 - 稳定版本（推荐使用）
v1.1 - 最新版本
v0.9 - 废弃版本（6个月后停止支持）

# 版本响应头
API-Version: v1.1
API-Supported-Versions: v1.0, v1.1
API-Deprecated-Versions: v0.9
```

### 7.3 版本迁移指南

```markdown
# v1.0 到 v1.1 迁移指南

## 新增功能

- 添加用户头像字段
- 支持批量操作API

## 变更内容

- `created_time` 字段重命名为 `created_at`
- 分页参数 `page_size` 重命名为 `limit`

## 废弃功能

- `GET /api/v1/user` 已废弃，请使用 `GET /api/v1/users/{id}`

## 兼容性

- 所有v1.0 API在v1.1中仍然可用
- 建议在2024年6月前完成迁移
```

## 8. 文档格式规范

### 8.1 OpenAPI规范

```yaml
openapi: 3.0.3
info:
  title: OAuth2.1 认证授权中心 API
  description: 企业级OAuth2.1认证授权中心API文档
  version: 1.0.0
  contact:
    name: 开发团队
    email: dev@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.example.com/v1
    description: 生产环境
  - url: https://staging-api.example.com/v1
    description: 测试环境

paths:
  /users:
    get:
      summary: 获取用户列表
      description: 分页获取系统用户列表
      tags:
        - Users
      parameters:
        - name: page
          in: query
          description: 页码
          required: false
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: limit
          in: query
          description: 每页数量
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: 成功获取用户列表
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
      security:
        - BearerAuth: []

components:
  schemas:
    User:
      type: object
      required:
        - id
        - name
        - email
      properties:
        id:
          type: string
          description: 用户ID
          example: '123'
        name:
          type: string
          description: 用户姓名
          example: '张三'
        email:
          type: string
          format: email
          description: 用户邮箱
          example: 'zhangsan@example.com'
        created_at:
          type: string
          format: date-time
          description: 创建时间
          example: '2024-01-20T10:00:00Z'

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  responses:
    Unauthorized:
      description: 未认证
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
```

### 8.2 API文档结构

````markdown
# API端点文档模板

## GET /api/v1/users/{id}

### 描述

根据用户ID获取用户详细信息。

### 请求参数

#### 路径参数

| 参数名 | 类型   | 必需 | 描述   |
| ------ | ------ | ---- | ------ |
| id     | string | 是   | 用户ID |

#### 查询参数

| 参数名 | 类型   | 必需 | 默认值   | 描述                   |
| ------ | ------ | ---- | -------- | ---------------------- |
| fields | string | 否   | 全部字段 | 返回字段列表，逗号分隔 |

#### 请求头

| 头部名称      | 类型   | 必需 | 描述         |
| ------------- | ------ | ---- | ------------ |
| Authorization | string | 是   | Bearer token |

### 响应

#### 成功响应 (200)

```json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "张三",
    "email": "zhangsan@example.com",
    "created_at": "2024-01-20T10:00:00Z"
  }
}
```
````

#### 错误响应

**404 Not Found**

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "用户不存在"
  }
}
```

### 示例

#### cURL

```bash
curl -X GET "https://api.example.com/v1/users/123" \
  -H "Authorization: Bearer your_access_token" \
  -H "Accept: application/json"
```

#### JavaScript

```javascript
const response = await fetch('https://api.example.com/v1/users/123', {
  headers: {
    Authorization: 'Bearer your_access_token',
    Accept: 'application/json',
  },
});
const user = await response.json();
```

#### Python

```python
import requests

headers = {
    'Authorization': 'Bearer your_access_token',
    'Accept': 'application/json'
}

response = requests.get('https://api.example.com/v1/users/123', headers=headers)
user = response.json()
```

````

## 9. 安全规范

### 9.1 传输安全

- **HTTPS强制**: 所有API必须使用HTTPS
- **TLS版本**: 最低支持TLS 1.2
- **证书验证**: 严格验证SSL证书
- **HSTS**: 启用HTTP严格传输安全

### 9.2 认证安全

```bash
# JWT令牌安全
- 使用RS256算法签名
- 设置合理的过期时间（15分钟-1小时）
- 实现令牌轮换机制
- 维护令牌黑名单

# PKCE安全
- 强制使用S256方法
- code_verifier长度至少43字符
- 一次性使用授权码
````

### 9.3 输入验证

```typescript
// 输入验证示例
export const userCreateSchema = {
  type: 'object',
  required: ['name', 'email', 'password'],
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      pattern: '^[\u4e00-\u9fa5a-zA-Z\s]+$',
    },
    email: {
      type: 'string',
      format: 'email',
      maxLength: 100,
    },
    password: {
      type: 'string',
      minLength: 8,
      maxLength: 128,
      pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]',
    },
  },
  additionalProperties: false,
};
```

### 9.4 速率限制

```bash
# 速率限制策略
- 全局限制: 1000请求/小时
- 认证端点: 10请求/分钟
- 敏感操作: 5请求/分钟
- IP白名单: 无限制

# 响应头
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
Retry-After: 60
```

## 10. 性能规范

### 10.1 响应时间

| 操作类型 | 目标响应时间 | 最大响应时间 |
| -------- | ------------ | ------------ |
| 简单查询 | < 100ms      | < 500ms      |
| 复杂查询 | < 500ms      | < 2s         |
| 数据创建 | < 200ms      | < 1s         |
| 数据更新 | < 200ms      | < 1s         |
| 文件上传 | < 5s         | < 30s        |

### 10.2 缓存策略

```bash
# 缓存控制头
Cache-Control: public, max-age=3600        # 公共资源，1小时
Cache-Control: private, max-age=300         # 私有资源，5分钟
Cache-Control: no-cache, no-store           # 敏感数据，不缓存

# ETag支持
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
If-None-Match: "33a64df551425fcc55e4d42a148795d9f25f89d4"
```

### 10.3 分页优化

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1000,
    "total_pages": 50,
    "has_next": true,
    "has_prev": false,
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "prev_cursor": null
  },
  "links": {
    "first": "/api/v1/users?page=1&limit=20",
    "last": "/api/v1/users?page=50&limit=20",
    "next": "/api/v1/users?page=2&limit=20",
    "prev": null
  }
}
```

### 10.4 压缩支持

```bash
# 请求压缩
Accept-Encoding: gzip, deflate, br

# 响应压缩
Content-Encoding: gzip
Vary: Accept-Encoding
```

## 11. V2 API 详细规范

### 11.1 认证授权 API

#### 11.1.1 授权端点

**基本信息**
- **路径**: `/api/v2/oauth/authorize`
- **方法**: GET
- **描述**: OAuth2.1 授权码流程的授权端点，支持PKCE扩展
- **认证**: 无需Bearer Token（用户登录验证）

**请求参数**

| 参数名 | 类型 | 必需 | 描述 | 示例 |
|--------|------|------|------|------|
| response_type | string | 是 | 响应类型，固定为"code" | code |
| client_id | string | 是 | 客户端标识符 | my_client_app |
| redirect_uri | string | 是 | 重定向URI | https://app.example.com/callback |
| scope | string | 否 | 请求的权限范围 | read write |
| state | string | 推荐 | 防CSRF攻击的随机字符串 | xyz123 |
| code_challenge | string | 推荐 | PKCE代码挑战 | E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM |
| code_challenge_method | string | 推荐 | PKCE挑战方法 | S256 |

**请求示例**
```http
GET /api/v2/oauth/authorize?response_type=code&client_id=my_client_app&redirect_uri=https%3A//app.example.com/callback&scope=read%20write&state=xyz123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256 HTTP/1.1
Host: auth.example.com
```

**成功响应**
- **状态码**: 302 Found
- **描述**: 重定向到客户端指定的redirect_uri

```http
HTTP/1.1 302 Found
Location: https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123
```

**错误响应**
```http
HTTP/1.1 302 Found
Location: https://app.example.com/callback?error=invalid_request&error_description=Missing%20required%20parameter%3A%20client_id&state=xyz123
```

**错误码说明**
- `invalid_request`: 请求缺少必需参数或格式错误
- `unauthorized_client`: 客户端未授权使用此方法
- `access_denied`: 用户拒绝授权请求
- `unsupported_response_type`: 不支持的响应类型
- `invalid_scope`: 请求的范围无效或未知
- `server_error`: 服务器内部错误

#### 11.1.2 令牌端点

**基本信息**
- **路径**: `/api/v2/oauth/token`
- **方法**: POST
- **描述**: 获取访问令牌，支持多种授权类型
- **认证**: 客户端认证（Basic Auth或请求体）

**请求头**
```http
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
```

**授权码模式请求参数**

| 参数名 | 类型 | 必需 | 描述 | 示例 |
|--------|------|------|------|------|
| grant_type | string | 是 | 授权类型，值为"authorization_code" | authorization_code |
| code | string | 是 | 授权码 | SplxlOBeZQQYbYS6WxSbIA |
| redirect_uri | string | 是 | 重定向URI（必须与授权请求一致） | https://app.example.com/callback |
| client_id | string | 是* | 客户端ID（如果未在Authorization头中提供） | my_client_app |
| client_secret | string | 是* | 客户端密钥（如果未在Authorization头中提供） | client_secret_123 |
| code_verifier | string | 否 | PKCE代码验证器 | dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk |

**客户端凭证模式请求参数**

| 参数名 | 类型 | 必需 | 描述 | 示例 |
|--------|------|------|------|------|
| grant_type | string | 是 | 授权类型，值为"client_credentials" | client_credentials |
| scope | string | 否 | 请求的权限范围 | read write |
| client_id | string | 是* | 客户端ID | my_client_app |
| client_secret | string | 是* | 客户端密钥 | client_secret_123 |

**刷新令牌请求参数**

| 参数名 | 类型 | 必需 | 描述 | 示例 |
|--------|------|------|------|------|
| grant_type | string | 是 | 授权类型，值为"refresh_token" | refresh_token |
| refresh_token | string | 是 | 刷新令牌 | tGzv3JOkF0XG5Qx2TlKWIA |
| scope | string | 否 | 请求的权限范围（不能超过原始范围） | read |
| client_id | string | 是* | 客户端ID | my_client_app |
| client_secret | string | 是* | 客户端密钥 | client_secret_123 |

**请求示例**
```http
POST /api/v2/oauth/token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=

grant_type=authorization_code&code=SplxlOBeZQQYbYS6WxSbIA&redirect_uri=https%3A//app.example.com/callback&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**成功响应**
```json
{
  "success": true,
  "data": {
    "access_token": "2YotnFZFEjr1zCsicMWpAA",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
    "scope": "read write"
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

**错误响应**
```json
{
  "success": false,
  "error": {
    "code": "invalid_grant",
    "message": "The provided authorization grant is invalid, expired, revoked, or does not match the redirection URI",
    "details": {
      "grant_type": "authorization_code",
      "error_uri": "https://docs.example.com/oauth/errors#invalid_grant"
    }
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

#### 11.1.3 令牌撤销

**基本信息**
- **路径**: `/api/v2/oauth/revoke`
- **方法**: POST
- **描述**: 撤销访问令牌或刷新令牌
- **认证**: 客户端认证

**请求参数**

| 参数名 | 类型 | 必需 | 描述 | 示例 |
|--------|------|------|------|------|
| token | string | 是 | 要撤销的令牌 | 2YotnFZFEjr1zCsicMWpAA |
| token_type_hint | string | 否 | 令牌类型提示 | access_token 或 refresh_token |
| client_id | string | 是* | 客户端ID | my_client_app |
| client_secret | string | 是* | 客户端密钥 | client_secret_123 |

**请求示例**
```http
POST /api/v2/oauth/revoke HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=

token=2YotnFZFEjr1zCsicMWpAA&token_type_hint=access_token
```

**成功响应**
```json
{
  "success": true,
  "data": {
    "revoked": true,
    "token_type": "access_token"
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

### 11.2 用户管理 API

#### 11.2.1 用户列表

**基本信息**
- **路径**: `/api/v2/users`
- **方法**: GET
- **描述**: 获取用户列表，支持分页和筛选
- **权限**: `users:list`

**请求参数**

| 参数名 | 类型 | 必需 | 描述 | 默认值 | 示例 |
|--------|------|------|------|--------|------|
| page | number | 否 | 页码 | 1 | 1 |
| pageSize | number | 否 | 每页数量 | 20 | 10 |
| search | string | 否 | 搜索关键词（用户名、邮箱） | - | john |
| status | string | 否 | 用户状态筛选 | - | active |
| sortBy | string | 否 | 排序字段 | createdAt | username |
| sortOrder | string | 否 | 排序方向 | desc | asc |

**请求示例**
```http
GET /api/v2/users?page=1&pageSize=10&search=john&status=active&sortBy=username&sortOrder=asc HTTP/1.1
Host: auth.example.com
Authorization: Bearer 2YotnFZFEjr1zCsicMWpAA
```

**成功响应**
```json
{
  "success": true,
  "data": [
    {
      "id": "user_123",
      "username": "john_doe",
      "email": "john@example.com",
      "displayName": "John Doe",
      "isActive": true,
      "lastLoginAt": "2024-12-19T09:30:00Z",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-12-19T09:30:00Z",
      "roles": [
        {
          "id": "role_456",
          "name": "user",
          "displayName": "普通用户"
        }
      ]
    }
  ],
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789",
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 150,
      "totalPages": 15,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### 11.2.2 创建用户

**基本信息**
- **路径**: `/api/v2/users`
- **方法**: POST
- **描述**: 创建新用户
- **权限**: `users:create`

**请求体**
```json
{
  "username": "jane_doe",
  "email": "jane@example.com",
  "password": "SecurePassword123!",
  "displayName": "Jane Doe",
  "isActive": true,
  "roleIds": ["role_456"]
}
```

**字段验证规则**

| 字段名 | 类型 | 必需 | 验证规则 | 描述 |
|--------|------|------|----------|------|
| username | string | 是 | 3-50字符，字母数字下划线 | 用户名 |
| email | string | 是 | 有效邮箱格式 | 邮箱地址 |
| password | string | 是 | 8-128字符，包含大小写字母数字特殊字符 | 密码 |
| displayName | string | 否 | 1-100字符 | 显示名称 |
| isActive | boolean | 否 | true/false | 是否激活 |
| roleIds | string[] | 否 | 有效的角色ID数组 | 角色列表 |

**成功响应**
```json
{
  "success": true,
  "data": {
    "id": "user_789",
    "username": "jane_doe",
    "email": "jane@example.com",
    "displayName": "Jane Doe",
    "isActive": true,
    "createdAt": "2024-12-19T10:30:00Z",
    "updatedAt": "2024-12-19T10:30:00Z",
    "roles": [
      {
        "id": "role_456",
        "name": "user",
        "displayName": "普通用户"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

### 11.3 角色管理 API

#### 11.3.1 角色列表

**基本信息**
- **路径**: `/api/v2/roles`
- **方法**: GET
- **描述**: 获取角色列表，支持分页和筛选
- **权限**: `roles:list`

**请求参数**

| 参数名 | 类型 | 必需 | 描述 | 默认值 | 示例 |
|--------|------|------|------|--------|------|
| page | number | 否 | 页码 | 1 | 1 |
| pageSize | number | 否 | 每页数量 | 20 | 10 |
| search | string | 否 | 搜索关键词（角色名称） | - | admin |
| isActive | boolean | 否 | 是否激活 | - | true |
| includePermissions | boolean | 否 | 是否包含权限信息 | false | true |

**成功响应**
```json
{
  "success": true,
  "data": [
    {
      "id": "role_123",
      "name": "admin",
      "displayName": "系统管理员",
      "description": "拥有系统所有权限的管理员角色",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-12-19T10:30:00Z",
      "permissions": [
        {
          "id": "perm_456",
          "name": "users:*",
          "resource": "users",
          "action": "*",
          "type": "api",
          "description": "用户管理所有权限"
        }
      ],
      "userCount": 5
    }
  ],
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789",
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 25,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### 11.3.2 创建角色

**基本信息**
- **路径**: `/api/v2/roles`
- **方法**: POST
- **描述**: 创建新角色
- **权限**: `roles:create`

**请求体**
```json
{
  "name": "editor",
  "displayName": "编辑员",
  "description": "内容编辑权限",
  "isActive": true,
  "permissionIds": ["perm_789", "perm_012"]
}
```

**字段验证规则**

| 字段名 | 类型 | 必需 | 验证规则 | 描述 |
|--------|------|------|----------|------|
| name | string | 是 | 2-50字符，字母数字下划线 | 角色名称（唯一） |
| displayName | string | 是 | 1-100字符 | 显示名称 |
| description | string | 否 | 最大500字符 | 角色描述 |
| isActive | boolean | 否 | true/false | 是否激活 |
| permissionIds | string[] | 否 | 有效的权限ID数组 | 权限列表 |

**成功响应**
```json
{
  "success": true,
  "data": {
    "id": "role_345",
    "name": "editor",
    "displayName": "编辑员",
    "description": "内容编辑权限",
    "isActive": true,
    "createdAt": "2024-12-19T10:30:00Z",
    "updatedAt": "2024-12-19T10:30:00Z",
    "permissions": [
      {
        "id": "perm_789",
        "name": "content:write",
        "resource": "content",
        "action": "write",
        "type": "api"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

### 11.4 权限管理 API

#### 11.4.1 权限列表

**基本信息**
- **路径**: `/api/v2/permissions`
- **方法**: GET
- **描述**: 获取权限列表，支持分页和筛选
- **权限**: `permissions:list`

**请求参数**

| 参数名 | 类型 | 必需 | 描述 | 默认值 | 示例 |
|--------|------|------|------|--------|------|
| page | number | 否 | 页码 | 1 | 1 |
| pageSize | number | 否 | 每页数量 | 20 | 10 |
| search | string | 否 | 搜索关键词（权限名称） | - | users |
| type | string | 否 | 权限类型筛选 | - | api |
| resource | string | 否 | 资源筛选 | - | users |
| action | string | 否 | 操作筛选 | - | read |

**成功响应**
```json
{
  "success": true,
  "data": [
    {
      "id": "perm_123",
      "name": "users:read",
      "resource": "users",
      "action": "read",
      "type": "api",
      "description": "读取用户信息权限",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-12-19T10:30:00Z",
      "roleCount": 3
    }
  ],
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789",
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 50,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### 11.4.2 创建权限

**基本信息**
- **路径**: `/api/v2/permissions`
- **方法**: POST
- **描述**: 创建新权限
- **权限**: `permissions:create`

**API权限请求体**
```json
{
  "type": "api",
  "name": "content:write",
  "resource": "content",
  "action": "write",
  "description": "内容写入权限",
  "apiConfig": {
    "method": "POST",
    "path": "/api/v2/content",
    "requireAuth": true
  }
}
```

**菜单权限请求体**
```json
{
  "type": "menu",
  "name": "admin_panel",
  "resource": "admin",
  "action": "access",
  "description": "管理面板访问权限",
  "menuConfig": {
    "menuId": "admin-panel",
    "path": "/admin",
    "icon": "admin",
    "order": 1
  }
}
```

**数据权限请求体**
```json
{
  "type": "data",
  "name": "user_data_own",
  "resource": "users",
  "action": "read",
  "description": "只能访问自己的用户数据",
  "dataConfig": {
    "scope": "own",
    "conditions": {
      "userId": "{{current_user_id}}"
    }
  }
}
```

**成功响应**
```json
{
  "success": true,
  "data": {
    "id": "perm_456",
    "name": "content:write",
    "resource": "content",
    "action": "write",
    "type": "api",
    "description": "内容写入权限",
    "createdAt": "2024-12-19T10:30:00Z",
    "updatedAt": "2024-12-19T10:30:00Z",
    "apiConfig": {
      "method": "POST",
      "path": "/api/v2/content",
      "requireAuth": true
    }
  },
  "meta": {
    "timestamp": "2024-12-19T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

---

**注意**: 本规范是活文档，会根据项目发展和最佳实践的演进持续更新。所有API开发都应遵循此规范，确保API的一致性和开发者体验。
