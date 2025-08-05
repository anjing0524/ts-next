# RBAC权限设计

## 权限模型

### 四层权限体系
1. **菜单权限**: 控制导航菜单显示
2. **API权限**: 控制接口访问
3. **操作权限**: 控制页面按钮操作
4. **数据权限**: 控制数据范围访问

### 权限命名规范
格式: `resource:action`

示例:
- `user:create` - 创建用户
- `role:update` - 更新角色
- `client:delete` - 删除客户端
- `menu:system:user:view` - 查看用户菜单

## 核心权限列表

### 系统基础
- `dashboard:view` - 查看仪表盘
- `profile:view` - 查看个人资料
- `profile:update` - 更新个人资料

### 用户管理
- `menu:system:user:view` - 用户管理菜单
- `user:list` - 查看用户列表
- `user:create` - 创建用户
- `user:read` - 查看用户详情
- `user:update` - 更新用户
- `user:delete` - 删除用户

### 角色管理
- `menu:system:role:view` - 角色管理菜单
- `role:list` - 查看角色列表
- `role:create` - 创建角色
- `role:read` - 查看角色详情
- `role:update` - 更新角色
- `role:delete` - 删除角色
- `roles:permissions:read` - 查看角色权限
- `roles:permissions:assign` - 分配角色权限

### 客户端管理
- `menu:system:client:view` - 客户端管理菜单
- `client:list` - 查看客户端列表
- `client:create` - 创建客户端
- `client:read` - 查看客户端详情
- `client:update` - 更新客户端
- `client:delete` - 删除客户端
- `oauth:clients:manage` - 管理客户端密钥

### 权限管理
- `menu:system:permission:view` - 权限管理菜单
- `permission:list` - 查看权限列表
- `permission:create` - 创建权限
- `permission:read` - 查看权限详情
- `permission:update` - 更新权限
- `permission:delete` - 删除权限

### 审计管理
- `menu:system:audit:view` - 审计日志菜单
- `audit:list` - 查看审计日志

## 预定义角色

### SYSTEM_ADMIN (系统管理员)
- 拥有所有权限
- 不可删除

### USER_ADMIN (用户管理员)
- 用户管理全部权限
- 角色查看权限
- 仪表盘和个人资料权限

### SECURITY_ADMIN (安全管理员)
- 角色、权限、客户端管理
- 审计日志查看
- 仪表盘和个人资料权限

### USER (普通用户)
- 仪表盘查看
- 个人资料查看和更新

## 权限实施

### 后端实施
- 中间件拦截API请求
- JWT中提取用户权限
- 与端点所需权限比对
- 记录权限检查日志

### 前端实施
- 根据权限渲染菜单
- 页面级权限控制
- 按钮级权限控制
- 无权限时显示403

### 权限映射
```typescript
// API端点权限映射
const permissionMap = {
  'POST /api/v2/users': 'user:create',
  'GET /api/v2/users': 'user:list',
  'PUT /api/v2/users/:id': 'user:update',
  'DELETE /api/v2/users/:id': 'user:delete',
  // ...
}
```