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

---

**注意**: 本规范是活文档，会根据项目发展和最佳实践的演进持续更新。所有API开发都应遵循此规范，确保API的一致性和开发者体验。
