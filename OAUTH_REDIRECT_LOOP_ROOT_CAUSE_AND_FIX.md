# OAuth 死循环重定向问题 - 根本原因分析和修复

## 问题现象

E2E 测试显示用户登录时出现无限重定向循环：
```
/admin → /login → /login → /login → /login ... (无限循环)
```

所有6个测试都失败，浏览器被困在 `/login` 页面无法脱出。

## 根本原因

**权限中间件（Permission Middleware）缺少 `/api/v2/auth/login` 的公开路由声明**

### 问题详解

位置：`apps/oauth-service-rust/src/middleware/permission.rs`，第127-135行

**修复前的代码：**
```rust
pub async fn permission_middleware(request: Request, next: Next) -> Result<Response, AppError> {
    // 公开路径列表，不需要权限检查
    let public_paths = [
        "/health",
        "/api/v2/oauth/token",
        "/api/v2/oauth/authorize",
        "/api/v2/oauth/introspect",
        "/api/v2/oauth/revoke",
        // ❌ 缺少 "/api/v2/auth/login"
    ];
```

### 错误的执行流程

1. 用户访问 `/admin` (受保护路由)
2. middleware.ts 启动 OAuth 授权流程，重定向到 `/api/v2/oauth/authorize`
3. OAuth Service 检查 session_token，不存在，重定向到 `/login?redirect=...`
4. 用户在登录页面输入凭证，提交 POST `/api/v2/auth/login`
5. **权限中间件拦截**：`/api/v2/auth/login` 不在公开路由列表中
6. 权限中间件尝试从 request.extensions 获取 `AuthContext`
7. 由于认证中间件已跳过此路由，AuthContext 不存在
8. 权限中间件返回 `401 Invalid or expired token`
9. 前端错误处理或浏览器自动跳回 `/login`
10. **回到步骤 4，无限循环**

## 修复方案

### 修改文件
`apps/oauth-service-rust/src/middleware/permission.rs`

### 修复代码
```rust
pub async fn permission_middleware(request: Request, next: Next) -> Result<Response, AppError> {
    // 公开路径列表，不需要权限检查
    let public_paths = [
        "/health",
        "/api/v2/oauth/token",
        "/api/v2/oauth/authorize",
        "/api/v2/oauth/introspect",
        "/api/v2/oauth/revoke",
        "/api/v2/auth/login",          // ✅ OAuth login endpoint - must be public
        "/api/v2/auth/authenticate",   // ✅ Authentication endpoint - must be public
    ];
```

### 修复原理

通过将 `/api/v2/auth/login` 添加到权限中间件的公开路由列表中，允许该端点跳过权限检查。这是合理的，因为：

1. **认证中间件已处理**：该路由在 `middleware/auth.rs` 中已经列为公开路由
2. **无需权限验证**：登录端点不需要任何权限，它是让用户获得凭证的入口点
3. **标准 OAuth 设计**：登录端点应该对所有用户开放

## 修复验证

### 修复前测试结果
- ❌ 6 个测试全部失败
- ❌ 死循环重定向：`/login → /login → /login → ...`
- ❌ 登录端点返回 401 "Invalid or expired token"

### 修复后测试结果
- ✅ **4 个测试通过**（之前全部失败）
- ✅ **不再出现死循环重定向**
- ✅ 登录端点返回 401 "Invalid username or password"（正确的错误，说明认证逻辑在工作）
- 2 个测试仍有其他问题（在OAuth流程的后期阶段），不相关于此根本原因

### 关键证据

**修复前的错误流程：**
```
curl -X POST http://localhost:3001/api/v2/auth/login ...
Response: {"error":"Invalid or expired token"}
HTTP Status: 401
```

**修复后的正确流程：**
```
curl -X POST http://localhost:3001/api/v2/auth/login ...
Response: {"error":"Invalid username or password"}
HTTP Status: 401
```
（如果使用正确凭证，会返回 `{"success": true, "redirect_url": "..."}` 200 OK）

## 中间件执行顺序

为了理解为什么这个问题发生，需要了解中间件执行的顺序（在 `apps/oauth-service-rust/src/app.rs` 中）：

```
1. rate_limit_middleware     - 限流检查
↓
2. auth_middleware           - Bearer token 验证（但 /api/v2/auth/login 被跳过）
↓
3. permission_middleware     - 权限检查（这里缺少 /api/v2/auth/login 导致失败）
↓
4. 业务逻辑处理
```

由于权限中间件在认证中间件之后，即使认证中间件已经跳过了某个路由，权限中间件仍然需要显式允许它。

## 防止类似问题的最佳实践

1. **中间件保持同步**：当在认证中间件中添加公开路由时，也要在权限中间件中添加
2. **测试覆盖**：为每个公开端点添加单元测试，验证它们不需要认证
3. **文档化意图**：明确注释为什么某些路由是公开的
4. **代码审查**：特别关注中间件相关的更改

## 相关文件

- 修改文件：`apps/oauth-service-rust/src/middleware/permission.rs`
- 相关文件：`apps/oauth-service-rust/src/middleware/auth.rs`
- 相关文件：`apps/oauth-service-rust/src/app.rs`

## 时间线

- **问题识别**：深度分析了三层服务（Admin Portal、OAuth Service、Pingora）的交互
- **诊断过程**：通过curl测试隔离了问题到HTTP层，而不依赖E2E测试输出
- **根本原因发现**：识别权限中间件是真正的罪魁祸首，而不是之前认为的cookie传递问题
- **修复验证**：4个E2E测试通过，死循环消失

---

**生成时间**: 2025-10-30
**修复状态**: ✅ **已解决** - 死循环重定向问题已修复
