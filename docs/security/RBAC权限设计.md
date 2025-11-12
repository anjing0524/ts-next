# RBAC权限设计

> **文档版本**: v1.0.0
> **最后更新**: 2025-11-11

## 1. 权限模型

本系统采用基于角色的访问控制（RBAC）模型。权限被分配给角色，而用户通过被赋予一个或多个角色来继承这些权限。

### 1.1. 核心概念
- **用户 (User)**: 系统中的操作实体，可以被分配多个角色。
- **角色 (Role)**: 一组权限的集合。一个角色可以包含多个权限，一个用户也可以拥有多个角色。
- **权限 (Permission)**: 定义了一个具体的操作，是授权的最小单位。

### 1.2. 权限命名规范
为了清晰和一致性，权限采用 `resource:action` 的格式进行命名。

- **resource**: 受保护的资源，通常是业务实体的小写复数形式（如 `users`, `roles`, `clients`）。
- **action**: 对资源执行的操作（如 `list`, `create`, `read`, `update`, `delete`）。

**示例**:
- `users:create`: 创建用户的权限。
- `roles:update`: 更新角色的权限。
- `clients:delete`: 删除客户端的权限。

## 2. 核心权限列表

以下是系统的核心权限，涵盖了所有管理功能。

### 用户管理
- `users:list`: 查看用户列表
- `users:create`: 创建新用户
- `users:read`: 查看单个用户详情
- `users:update`: 更新用户信息
- `users:delete`: 删除用户

### 角色管理
- `roles:list`: 查看角色列表
- `roles:create`: 创建新角色
- `roles:read`: 查看单个角色详情
- `roles:update`: 更新角色信息
- `roles:delete`: 删除角色
- `roles:assign_permissions`: 为角色分配权限

### 客户端管理
- `clients:list`: 查看OAuth客户端列表
- `clients:create`: 创建新客户端
- `clients:read`: 查看客户端详情
- `clients:update`: 更新客户端信息
- `clients:delete`: 删除客户端
- `clients:reset_secret`: 重置客户端密钥

### 审计
- `audits:list`: 查看审计日志

## 3. 预定义角色

系统预设了几个基础角色，以满足常见的管理需求。

### `SYSTEM_ADMIN` (系统管理员)
- **描述**: 拥有系统的所有权限，是最高权限角色。
- **权限**: `*` (所有权限)
- **说明**: 此角色不可被删除或修改。

### `USER_ADMIN` (用户管理员)
- **描述**: 负责管理用户和查看角色。
- **权限**:
  - `users:*` (所有用户管理权限)
  - `roles:list`
  - `roles:read`

### `SECURITY_ADMIN` (安全管理员)
- **描述**: 负责管理角色、权限、客户端和审计。
- **权限**:
  - `roles:*`
  - `clients:*`
  - `audits:list`

### `USER` (普通用户)
- **描述**: 默认角色，仅拥有查看自己信息的权限。
- **权限**:
  - `profile:read`
  - `profile:update`

## 4. 权限实施

### 4.1. 后端实施 (oauth-service-rust)

1.  **JWT声明**: 用户成功登录后，其拥有的所有权限列表会被编码到JWT的 `permissions` 声明中。
2.  **认证中间件**: 在`actix-web`中，创建一个认证中间件，用于保护需要授权的API路由。
3.  **权限校验**: 中间件首先验证JWT的有效性，然后从JWT中提取 `permissions` 列表。
4.  **路由保护**: 将API路由与所需的权限进行映射。中间件检查当前用户的权限列表是否包含API所需的权限。
    ```rust
    // 示例：在actix-web中保护路由
    web::resource("/users")
        .route(web::get().to(get_users).guard(RequiresPermission("users:list")))
        .route(web.post().to(create_user).guard(RequiresPermission("users:create")))
    ```
5.  **拒绝访问**: 如果权限不足，API返回 `403 Forbidden` 错误。

### 4.2. 前端实施 (admin-portal)

1.  **权限获取**: 用户登录后，从JWT中解码出权限列表，并保存在前端状态管理中（如Zustand或React Context）。
2.  **路由保护**: 使用一个高阶组件（HOC）或自定义Hook（如 `useAuthorization`）来包装需要权限的页面级路由。如果用户没有所需权限，则重定向到未授权页面。
3.  **UI元素控制**:
    - **菜单**: 根据用户权限动态生成侧边栏导航菜单。
    - **按钮/操作**: 在组件内部，根据权限状态来决定是否渲染某个按钮或操作链接。
    ```jsx
    // 示例：在React组件中控制按钮显示
    const { hasPermission } = useAuthorization();

    return (
      <div>
        {hasPermission('users:create') && (
          <Button onClick={handleCreateUser}>创建用户</Button>
        )}
      </div>
    );
    ```

## 5. 扩展性

- **动态权限**: 权限不是硬编码的，而是存储在数据库中。可以通过管理后台动态添加、修改或删除权限。
- **自定义角色**: 管理员可以创建新的角色，并为其灵活分配任意权限组合，以适应不断变化的业务需求。
