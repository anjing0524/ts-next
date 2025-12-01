# OAuth 架构修复总结 (2025-11-28)

## 问题根本原因

**Next.js 16 流式响应与 Pingora 不兼容**

Admin Portal 中的 `/api/v2/[...path]` 代理路由在 Next.js 16 中产生了流式响应，Pingora 反向代理无法正确处理这种流式响应，导致浏览器收到 `net::ERR_EMPTY_RESPONSE` 错误。

## 实施的修复

### 1. 删除 Admin Portal 的 API 代理层

**位置**: `/apps/admin-portal/app/api/`

**删除的文件**:
- ❌ `/api/v2/[...path]/route.ts` - 不需要的 API 代理路由
- ❌ `/api/auth/login-callback/route.ts` - 不应该在前端处理的认证 API

**原因**:
- Admin Portal 应该是纯 UI 层 (Next.js 16)
- 所有 API 调用应该由后端 OAuth Service 处理
- 移除中间层可以避免 Next.js 的流式响应问题

### 2. 架构重新设计

**修改前**:
```
浏览器 → Pingora (6188)
         ├─ /api/v2/* → Admin Portal (3002) [Next.js 代理]
         │           → OAuth Service (3001)  [产生流式响应] ❌
         └─ 其他路由 → Admin Portal (3002)
```

**修改后**:
```
浏览器 → Pingora (6188)
         ├─ /api/v2/* → OAuth Service (3001) [直接路由] ✅
         └─ 其他路由 → Admin Portal (3002) [纯 UI]
```

### 3. 前端登录表单更新

**文件**: `/apps/admin-portal/components/auth/username-password-form.tsx`

**变更**: 更新注释说明登录请求直接通过 Pingora 代理到 OAuth Service

```typescript
// 直接通过 Pingora 代理访问 OAuth Service API
// Pingora 会根据 /api/v2/ 路由转发到 OAuth Service
const loginUrl = '/api/v2/auth/login';
```

## 验证结果

✅ **登录页面成功加载**
```bash
curl -s http://localhost:6188/login | grep -c "form"
# 输出: 1 (表单已加载)
```

✅ **API 调用成功返回**
```bash
curl -s -X POST http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","redirect":"..."}'
# 返回: {"success": true, "redirect_url": "..."}
```

✅ **构建成功**
```
Next.js build completed without errors
Routes generated:
 - /api/health (仅保留健康检查)
 - 无 /api/v2 代理路由 ✅
```

## 关键收获

1. **流式响应问题**: Next.js 16 在代理响应时产生流式响应，某些反向代理可能无法正确处理
2. **架构原则**: 前端应该是纯 UI 层，不应该实现业务逻辑或 API 代理
3. **反向代理职责**: Pingora 应该直接处理请求路由，而不是依赖后端服务实现代理

## 后续工作

- [ ] 确认 E2E 测试完全通过
- [ ] 验证 OAuth 流程端到端的完整性
- [ ] 性能测试（去除代理层可以提高性能）
- [ ] 文档更新
