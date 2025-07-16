# API设计规范

**文档版本**: v2.0  
**创建日期**: 2025-01-28  
**最后更新**: 2025-07-08  
**作者**: API 设计团队  
**状态**: 正式版 - 核心规范已应用

## 1. 引言

本文档定义了基于 Turborepo 的 OAuth2.1 认证授权中心和微服务平台的 API 设计规范。所有微服务应用都必须遵循这些规范，以确保 API 的一致性、可维护性和可扩展性。

**架构层次**:
- **Pingora Proxy (8080)**: 统一网关入口，负责路由分发和负载均衡
- **微服务应用**: oauth-service, admin-portal, flow-service, kline-service
- **共享包**: @repo/ui, @repo/lib, @repo/database 等

遵循本规范有助于提高开发效率，减少集成成本，并提升整体系统质量。

## 2. 通用原则

- **RESTful 风格**: 尽可能遵循RESTful设计原则，使用HTTP方法表示操作，URL表示资源。
- **无状态**: API应是无状态的，每次请求都包含所有必要的信息。
- **易于理解**: API设计应直观、易于理解和使用。
- **一致性**: 命名、格式、错误处理等应在所有API中保持一致。
- **版本控制**: API应进行版本控制，以支持未来的演进。

## 3. URL设计规范

### 3.1 网关层路由设计

**Pingora Proxy 统一入口 (8080)**:
```
http://localhost:8080/api/v2/*     → oauth-service (3001)
http://localhost:8080/admin/*      → admin-portal (3002)
http://localhost:8080/flow/*       → flow-service (3004)
http://localhost:8080/kline/*      → kline-service (3003)
```

### 3.2 基础路径

所有API都应该以 `/api/v2` 开头，这是当前唯一的稳定版本。

```
/api/v2/...  # 当前稳定版本
```

### 3.3 资源命名

- 使用复数形式的名词
- 使用小写字母和连字符
- 避免使用动词

**正确示��**:
```
/api/v2/users
/api/v2/user-profiles
/api/v2/oauth-clients
/api/v2/oauth/authorize
```

**错误示例**:
```
/api/v1/user
/api/v1/getUserProfile
/api/v1/oauthClients
```

### 3.4 嵌套资源

对于有层级关系的资源，使用嵌套路径：

```
/api/v2/users/{userId}/profiles
/api/v2/clients/{clientId}/tokens
/api/v2/roles/{roleId}/permissions
/api/v2/clients/{clientId}/scopes
```

### 3.5 服务特定路径

各微服务的特定路径规范：

**oauth-service**:
```
/api/v2/oauth/authorize     # 授权端点
/api/v2/oauth/token        # 令牌端点
/api/v2/oauth/userinfo     # 用户信息
/api/v2/users/*            # 用户管理
/api/v2/roles/*            # 角色管理
/api/v2/clients/*          # 客户端管理
```

**其他服务**:
```
/admin/api/v1/*            # 管理后台API (示例)
/flow/api/v1/*             # 工作流API (示例)
/kline/api/v1/*            # K线图API (示例)
```

- **操作**: 对于非CRUD操作，可以使用动词，但应谨慎使用，例如 `/api/v2/users/{userId}/activate`。

**示例**:
- `GET /api/v2/users` - 获取用户列表
- `GET /api/v2/users/{userId}` - 获取特定用户
- `POST /api/v2/users` - 创建新用户
- `PUT /api/v2/users/{userId}` - 更新特定用户
- `DELETE /api/v2/users/{userId}` - 删除特定用户
- `POST /api/v2/clients/{clientId}/secret` - 轮换客户端密钥

## 4. HTTP方法使用

- **GET**: 用于获取资源。
- **POST**: 用于创建资源或执行非幂等操作。
- **PUT**: 用于完整更新资源（幂等操作）。
- **PATCH**: 用于部分更新资源（幂等操作）。
- **DELETE**: 用于删除资源。

## 5. 请求/响应体格式

- **数据格式**: 统一使用 `JSON` 格式进行请求和响应。
- **字符编码**: 统一使用 `UTF-8` 编码。
- **请求头**: `Content-Type: application/json`。
- **响应头**: `Content-Type: application/json`。

### 5.1. 成功响应结构

```json
// 单个资源
{
  "success": true,
  "message": "操作成功",
  "data": { /* 资源对象 */ }
}

// 列表资源 (带分页)
{
  "success": true,
  "message": "操作成功",
  "data": [ /* 资源对象数组 */ ],
  "pagination": {
    "totalItems": 100,
    "currentPage": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

### 5.2. 错误响应结构

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { /* 可选：更详细的错误信息，如字段验证失败 */ }
  }
}
```

## 5.3. 统一响应工具函数与调用规范

所有服务端API必须统一使用`successResponse`和`errorResponse`工具函数返回响应，禁止直接调用`NextResponse.json`。

### successResponse 用法
```ts
successResponse(data, statusCode = 200, message = '操作成功', meta?)
```
- data: 主数据内容（必填）
- statusCode: HTTP状态码（可选，默认200）
- message: 成功消息（可选，默认“操作成功”）
- meta: 分页等元信息（可选）

### errorResponse 用法
```ts
errorResponse({ message, statusCode = 500, details })
```
- message: 错误消息（必填）
- statusCode: HTTP状态码（可选，默认500）
- details: 附加错误详情（可选，建议包含业务错误码code）

**示例：**
```ts
return successResponse(user, 200, '用户信息获取成功');
return errorResponse({ message: '认证失败', statusCode: 401, details: { code: 'UNAUTHENTICATED' } });
```

### 响应结构
- 成功：
```json
{
  "success": true,
  "message": "操作成功",
  "data": { /* ... */ },
  "meta": { /* ... */ }
}
```
- 失败：
```json
{
  "success": false,
  "error": {
    "message": "错误描述",
    "details": { "code": "ERROR_CODE" }
  }
}
```

> 所有API必须严格遵循上述结构和调用方式，禁止混用参数、禁止自定义结构。团队开发、Code Review、测试均以此为唯一标准。

## 6. 错误码定义

- **HTTP状态码**: 用于表示请求的通用状态（例如 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error）。
- **业务错误码**: 在 `error.code` 字段中提供更具体的业务错误信息。建议使用统一的错误码范围或前缀。

**示例**:
- `INVALID_REQUEST`: 请求参数验证失败
- `UNAUTHENTICATED`: 认证失败/令牌无效
- `FORBIDDEN`: 权限不足
- `NOT_FOUND`: 资源未找到
- `SERVER_ERROR`: 服务器内部错误

## 7. 分页/排序/筛选规范

- **分页**: 
  - `page`: 当前页码 (从1开始，默认1)
  - `pageSize`: 每页记录数 (默认20，最大100)
- **排序**: 
  - `sortBy`: 排序字段，例如 `createdAt`
  - `sortOrder`: 排序顺序，`asc` (升序) 或 `desc` (降序)，默认 `desc`
- **筛选**: 
  - 使用查询参数进行筛选，例如 `GET /users?status=active&role=admin`
  - 对于复杂筛选，可以使用JSON字符串编码的查询参数，但应谨慎使用。

## 8. API版本控制

- **URL版本化**: 统一使用URL路径进行版本控制（`/api/v2`）。
- **渐进式更新**: 新版本API应尽可能兼容旧版本，或提供明确的迁移指南。

## 9. 安全考虑

- **认证**: 所有受保护的API必须进行认证。
- **授权**: 所有API必须进行权限检查。
- **输入验证**: 对所有用户输入进行严格的验证和清理。
- **敏感数据**: 避免在URL中暴露敏感数据。

## 10. 总结

遵循本API设计规范将有助于构建高质量、易于维护和扩展的API。本规范将随着项目的发展持续更新和完善。

- 会话注销统一调用 `/api/v2/oauth/revoke`
- 客户端密钥轮换API路径为 `/api/v2/clients/[clientId]/secret`
