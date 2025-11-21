# 系统角色与权限实现设计

**文档版本**: 1.0
**创建日期**: 2025-11-21
**适用版本**: v1.0 及以上
**所有者**: 架构团队、开发团队
**相关需求**: FR-009 (系统角色和权限定义矩阵)

---

## 目录

1. [概述](#概述)
2. [角色定义](#角色定义)
3. [权限矩阵设计](#权限矩阵设计)
4. [实现架构](#实现架构)
5. [数据库设计](#数据库设计)
6. [代码实现](#代码实现)
7. [权限检查流程](#权限检查流程)
8. [验证和测试](#验证和测试)

---

## 概述

### 设计目标

本文档定义了 OAuth 2.1 企业级认证授权系统的三层角色权限模型：

- **Super Admin** (super_admin): 系统管理员，拥有所有权限
- **Admin** (admin): 业务管理员，管理用户和角色，审计日志查看
- **User** (user): 普通用户，仅能查看/修改自己的信息

### 设计原则

```
1. 最小权限原则 - 每个角色只获得必需的权限
2. 职责分离 - Admin 无法修改权限定义，只能分配现有权限
3. 可审计性 - 所有权限变更被记录和可追溯
4. 一致性 - 权限矩阵硬编码，不允许运行时修改
```

---

## 角色定义

### 三个系统角色

#### 1. Super Admin (super_admin)

**目的**: 系统管理员，系统最高权限拥有者

**职责**:
- 系统配置和维护
- 管理员账户管理（创建、禁用、删除）
- 系统角色管理（但系统角色无法删除）
- OAuth 客户端配置
- 权限定义审查（只读）
- 重大事件审计日志查看
- 安全敏感操作授权

**权限特征**:
- 拥有除了"权限定义编辑"外的所有权限
- 可执行危险操作（删除用户、删除客户端等）
- 操作需要完整审计记录
- 需要关键操作双因素认证

#### 2. Admin (admin)

**目的**: 业务管理员，日常运营管理

**职责**:
- 用户生命周期管理（创建、启用、禁用）
- 用户个人信息修改
- 自定义角色管理（创建、修改自定义角色，分配权限）
- 权限分配给用户（仅使用现有权限）
- 审计日志查看和导出
- 系统监控和告警管理
- 用户支持和问题诊断

**权限特征**:
- 不能管理 Super Admin 和其他 Admin
- 不能删除系统角色（只能删除自定义角色）
- 不能查看/修改权限定义
- 不能管理 OAuth 客户端的技术参数

#### 3. User (user)

**目的**: 普通用户，自服务用户

**职责**:
- 查看个人资料信息
- 修改个人密码
- 查看个人的审计活动
- 管理个人的 OAuth 授权

**权限特征**:
- 只能访问自己的资源
- 无法看到其他用户信息
- 无法执行任何管理操作

---

## 权限矩阵设计

### 完整权限矩阵

#### 操作对象：Users（用户管理）

| 权限 | 描述 | Super Admin | Admin | User |
|------|------|:-----------:|:-----:|:----:|
| users.list | 列出所有用户 | ✅ | ✅ | ❌ |
| users.create | 创建新用户 | ✅ | ✅ | ❌ |
| users.read | 读取用户详情 | ✅ | ✅ | ✅ (仅自己) |
| users.update | 更新用户信息 | ✅ | ✅ (仅非管理用户) | ✅ (仅自己) |
| users.delete | 删除用户 | ✅ | ❌ | ❌ |
| users.toggle_active | 启用/禁用用户 | ✅ | ✅ | ❌ |
| users.reset_password | 重置用户密码 | ✅ | ✅ (需授权) | ✅ (仅自己) |

#### 操作对象：Roles（角色管理）

| 权限 | 描述 | Super Admin | Admin | User |
|------|------|:-----------:|:-----:|:----:|
| roles.list | 列出所有角色 | ✅ | ✅ | ❌ |
| roles.create | 创建新角色 | ✅ | ✅ (自定义角色) | ❌ |
| roles.read | 读取角色详情 | ✅ | ✅ | ❌ |
| roles.update | 编辑角色 | ✅ | ✅ (仅自定义) | ❌ |
| roles.delete | 删除角色 | ✅ | ✅ (仅自定义) | ❌ |
| roles.assign_permissions | 分配权限给角色 | ✅ | ✅ (仅自定义) | ❌ |

#### 操作对象：Permissions（权限定义）

| 权限 | 描述 | Super Admin | Admin | User |
|------|------|:-----------:|:-----:|:----:|
| permissions.list | 列出所有权限 | ✅ | ✅ | ❌ |
| permissions.read | 读取权限详情 | ✅ | ✅ | ❌ |
| permissions.create | 创建权限定义 | ❌ | ❌ | ❌ |
| permissions.update | 修改权限定义 | ❌ | ❌ | ❌ |
| permissions.delete | 删除权限定义 | ❌ | ❌ | ❌ |

**说明**: 权限定义作为系统配置，通过代码变更和数据库迁移管理，不允许运行时修改。

#### 操作对象：Clients（OAuth 客户端）

| 权限 | 描述 | Super Admin | Admin | User |
|------|------|:-----------:|:-----:|:----:|
| clients.list | 列出客户端 | ✅ | ✅ | ❌ |
| clients.create | 创建客户端 | ✅ | ❌ | ❌ |
| clients.read | 读取客户端详情 | ✅ | ✅ | ❌ |
| clients.update | 修改客户端配置 | ✅ | ❌ | ❌ |
| clients.delete | 删除客户端 | ✅ | ❌ | ❌ |
| clients.rotate_secret | 轮换客户端密钥 | ✅ | ❌ | ❌ |
| clients.view_secret | 查看客户端密钥 | ✅ | ❌ | ❌ |

#### 操作对象：Audit Logs（审计日志）

| 权限 | 描述 | Super Admin | Admin | User |
|------|------|:-----------:|:-----:|:----:|
| audit_logs.list | 列出审计日志 | ✅ | ✅ | ❌ |
| audit_logs.read | 读取日志详情 | ✅ | ✅ | ❌ |
| audit_logs.export | 导出审计日志 | ✅ | ✅ | ❌ |
| audit_logs.delete | 删除日志(仅过期) | ✅ | ❌ | ❌ |

---

## 实现架构

### 权限常量定义

```rust
// src/constants/roles.rs
// 系统角色定义（硬编码，不允许修改）

pub const SUPER_ADMIN_ROLE: &str = "super_admin";
pub const ADMIN_ROLE: &str = "admin";
pub const USER_ROLE: &str = "user";

// 系统预定义权限集
pub mod permissions {
    // Users
    pub const USERS_LIST: &str = "users.list";
    pub const USERS_CREATE: &str = "users.create";
    pub const USERS_READ: &str = "users.read";
    pub const USERS_UPDATE: &str = "users.update";
    pub const USERS_DELETE: &str = "users.delete";
    pub const USERS_TOGGLE_ACTIVE: &str = "users.toggle_active";
    pub const USERS_RESET_PASSWORD: &str = "users.reset_password";

    // Roles
    pub const ROLES_LIST: &str = "roles.list";
    pub const ROLES_CREATE: &str = "roles.create";
    pub const ROLES_READ: &str = "roles.read";
    pub const ROLES_UPDATE: &str = "roles.update";
    pub const ROLES_DELETE: &str = "roles.delete";
    pub const ROLES_ASSIGN_PERMISSIONS: &str = "roles.assign_permissions";

    // Permissions
    pub const PERMISSIONS_LIST: &str = "permissions.list";
    pub const PERMISSIONS_READ: &str = "permissions.read";

    // Clients
    pub const CLIENTS_LIST: &str = "clients.list";
    pub const CLIENTS_CREATE: &str = "clients.create";
    pub const CLIENTS_READ: &str = "clients.read";
    pub const CLIENTS_UPDATE: &str = "clients.update";
    pub const CLIENTS_DELETE: &str = "clients.delete";
    pub const CLIENTS_ROTATE_SECRET: &str = "clients.rotate_secret";
    pub const CLIENTS_VIEW_SECRET: &str = "clients.view_secret";

    // Audit Logs
    pub const AUDIT_LOGS_LIST: &str = "audit_logs.list";
    pub const AUDIT_LOGS_READ: &str = "audit_logs.read";
    pub const AUDIT_LOGS_EXPORT: &str = "audit_logs.export";
    pub const AUDIT_LOGS_DELETE: &str = "audit_logs.delete";
}

// 权限矩阵定义
pub fn get_role_permissions(role: &str) -> Vec<&'static str> {
    match role {
        SUPER_ADMIN_ROLE => vec![
            // 所有权限除了 permissions.create/update/delete
            permissions::USERS_LIST,
            permissions::USERS_CREATE,
            permissions::USERS_READ,
            permissions::USERS_UPDATE,
            permissions::USERS_DELETE,
            permissions::USERS_TOGGLE_ACTIVE,
            permissions::USERS_RESET_PASSWORD,
            permissions::ROLES_LIST,
            permissions::ROLES_CREATE,
            permissions::ROLES_READ,
            permissions::ROLES_UPDATE,
            permissions::ROLES_DELETE,
            permissions::ROLES_ASSIGN_PERMISSIONS,
            permissions::PERMISSIONS_LIST,
            permissions::PERMISSIONS_READ,
            permissions::CLIENTS_LIST,
            permissions::CLIENTS_CREATE,
            permissions::CLIENTS_READ,
            permissions::CLIENTS_UPDATE,
            permissions::CLIENTS_DELETE,
            permissions::CLIENTS_ROTATE_SECRET,
            permissions::CLIENTS_VIEW_SECRET,
            permissions::AUDIT_LOGS_LIST,
            permissions::AUDIT_LOGS_READ,
            permissions::AUDIT_LOGS_EXPORT,
            permissions::AUDIT_LOGS_DELETE,
        ],
        ADMIN_ROLE => vec![
            permissions::USERS_LIST,
            permissions::USERS_CREATE,
            permissions::USERS_READ,
            permissions::USERS_UPDATE,
            permissions::USERS_TOGGLE_ACTIVE,
            permissions::USERS_RESET_PASSWORD,
            permissions::ROLES_LIST,
            permissions::ROLES_READ,
            permissions::PERMISSIONS_LIST,
            permissions::PERMISSIONS_READ,
            permissions::CLIENTS_LIST,
            permissions::CLIENTS_READ,
            permissions::AUDIT_LOGS_LIST,
            permissions::AUDIT_LOGS_READ,
            permissions::AUDIT_LOGS_EXPORT,
        ],
        USER_ROLE => vec![
            // 用户仅能访问自己的资源
            permissions::USERS_READ,
            permissions::USERS_UPDATE,
            permissions::USERS_RESET_PASSWORD,
        ],
        _ => vec![],
    }
}
```

### 权限检查模块

```rust
// src/middleware/permission.rs

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

pub struct PermissionMiddleware;

impl PermissionMiddleware {
    /// 检查用户是否拥有指定权限
    pub async fn check_permission(
        user_id: &str,
        required_permission: &str,
        state: Arc<AppState>,
    ) -> Result<bool, AppError> {
        // 1. 从数据库获取用户的角色
        let user_roles = state
            .db_pool
            .get_user_roles(user_id)
            .await?;

        if user_roles.is_empty() {
            return Ok(false);
        }

        // 2. 检查用户的任何角色是否包含该权限
        for role in user_roles {
            let permissions = crate::constants::roles::get_role_permissions(&role);
            if permissions.contains(&required_permission) {
                // 3. 记录审计日志
                state
                    .audit_log
                    .log_permission_check(user_id, &role, required_permission, true)
                    .await?;

                return Ok(true);
            }
        }

        // 4. 记录拒绝
        state
            .audit_log
            .log_permission_check(user_id, "", required_permission, false)
            .await?;

        Ok(false)
    }
}

// 权限检查宏
#[macro_export]
macro_rules! require_permission {
    ($user_id:expr, $permission:expr, $state:expr) => {{
        PermissionMiddleware::check_permission($user_id, $permission, $state)
            .await
            .map_err(AppError::from)?
    }};
}
```

---

## 数据库设计

### 相关表结构

#### users 表扩展

```sql
ALTER TABLE users ADD COLUMN (
    is_active BOOLEAN DEFAULT true,          -- 账户是否激活
    locked_until TIMESTAMP NULL,              -- 账户锁定截止时间（防暴力破解）
    last_login_at TIMESTAMP NULL,             -- 最后登录时间
    password_changed_at TIMESTAMP DEFAULT NOW()  -- 最后修改密码时间
);
```

#### roles 表

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,         -- 角色名称
    description TEXT,                          -- 角色描述
    role_type ENUM('system', 'custom'),       -- 系统角色或自定义角色
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    CONSTRAINT system_roles_immutable CHECK (
        -- 系统角色无法被删除、禁用
        (role_type = 'custom') OR (is_active = true)
    )
);
```

#### permissions 表

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,        -- 权限标识 (users.list, roles.create 等)
    description TEXT,
    category VARCHAR(50),                      -- 分类 (users, roles, clients, audit_logs)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_category (category),
    -- 权限定义为系统配置，只读
    CONSTRAINT permissions_system_managed CHECK (true)
);
```

#### user_roles 表（关联表）

```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NULL,                 -- 可选：角色过期时间
    UNIQUE KEY unique_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id)
);

-- 审计日志
CREATE TABLE user_roles_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    action ENUM('assign', 'revoke', 'expire'),
    assigned_by UUID NOT NULL REFERENCES users(id),
    timestamp TIMESTAMP DEFAULT NOW(),
    reason TEXT,
    INDEX idx_user_id (user_id),
    INDEX idx_timestamp (timestamp)
);
```

#### role_permissions 表（关联表）

```sql
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    -- 仅系统角色的权限由代码定义，自定义角色的权限可修改
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id),
    CONSTRAINT system_role_permissions CHECK (
        -- 系统角色权限不可修改
        role_id NOT IN (SELECT id FROM roles WHERE role_type = 'system')
    )
);
```

---

## 代码实现

### 权限检查中间件

```rust
// src/middleware/permission_guard.rs

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

#[derive(Clone)]
pub struct RequirePermission(pub String);

/// 权限守卫中间件
pub async fn permission_guard(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    // 从请求中提取用户 ID（从 JWT token）
    let user_id = extract_user_id(&req)?;

    // 从路由元数据获取所需权限
    let required_permission = extract_required_permission(&req)?;

    // 检查权限
    let has_permission = PermissionMiddleware::check_permission(
        &user_id,
        &required_permission,
        state.clone(),
    )
    .await?;

    if !has_permission {
        return Err(AppError::Unauthorized(
            format!("Permission denied: {}", required_permission)
        ));
    }

    Ok(next.run(req).await)
}

// 路由装饰器使用示例
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    claims: Claims,
) -> Result<impl IntoResponse, AppError> {
    // 在路由处理中显式检查权限
    require_permission!(
        &claims.user_id,
        crate::constants::roles::permissions::USERS_LIST,
        state.clone()
    )?;

    // 业务逻辑...
    let users = state.db_pool.list_users().await?;
    Ok(Json(users))
}
```

### 细粒度权限检查

```rust
// src/services/permission_service.rs

pub struct PermissionService;

impl PermissionService {
    /// 检查用户是否可以访问特定资源
    pub async fn can_access_user(
        actor_id: &str,
        target_user_id: &str,
        action: &str,
        state: &Arc<AppState>,
    ) -> Result<bool, AppError> {
        // 1. 如果是访问自己，检查 users.read/users.update 等
        if actor_id == target_user_id {
            let self_permissions = vec![
                crate::constants::roles::permissions::USERS_READ,
                crate::constants::roles::permissions::USERS_UPDATE,
            ];
            return PermissionMiddleware::check_permission(
                actor_id,
                match action {
                    "read" => crate::constants::roles::permissions::USERS_READ,
                    "update" => crate::constants::roles::permissions::USERS_UPDATE,
                    _ => return Ok(false),
                },
                state.clone(),
            )
            .await;
        }

        // 2. 检查管理员权限，防止权限提升
        let actor_roles = state.db_pool.get_user_roles(actor_id).await?;
        let target_roles = state.db_pool.get_user_roles(target_user_id).await?;

        // 如果目标用户是管理员，仅 Super Admin 可以操作
        if target_roles
            .iter()
            .any(|r| r == crate::constants::roles::ADMIN_ROLE ||
                     r == crate::constants::roles::SUPER_ADMIN_ROLE)
        {
            return Ok(actor_roles
                .iter()
                .any(|r| r == crate::constants::roles::SUPER_ADMIN_ROLE));
        }

        // 3. 否则检查用户管理权限
        PermissionMiddleware::check_permission(
            actor_id,
            match action {
                "read" => crate::constants::roles::permissions::USERS_READ,
                "update" => crate::constants::roles::permissions::USERS_UPDATE,
                "delete" => crate::constants::roles::permissions::USERS_DELETE,
                _ => return Ok(false),
            },
            state.clone(),
        )
        .await
    }

    /// 检查用户是否可以创建/修改角色
    pub async fn can_manage_role(
        actor_id: &str,
        role_id: Option<&str>,  // None 表示创建新角色
        state: &Arc<AppState>,
    ) -> Result<bool, AppError> {
        // 检查基本权限
        let permission = match role_id {
            None => crate::constants::roles::permissions::ROLES_CREATE,
            Some(_) => crate::constants::roles::permissions::ROLES_UPDATE,
        };

        let has_permission =
            PermissionMiddleware::check_permission(actor_id, permission, state.clone()).await?;

        if !has_permission {
            return Ok(false);
        }

        // 如果是修改，检查是否为自定义角色
        if let Some(role_id) = role_id {
            let role = state.db_pool.get_role(role_id).await?;
            if role.role_type == "system" {
                // Admin 不能修改系统角色
                let actor_roles = state.db_pool.get_user_roles(actor_id).await?;
                if !actor_roles
                    .iter()
                    .any(|r| r == crate::constants::roles::SUPER_ADMIN_ROLE)
                {
                    return Ok(false);
                }
            }
        }

        Ok(true)
    }
}
```

---

## 权限检查流程

### 请求流程

```
用户请求
  ↓
[1] 验证 JWT Token 和用户身份
  ↓
[2] 从 URL/方法确定所需权限
  ↓
[3] 从缓存获取用户角色列表（带 TTL）
  ↓
[4] 根据角色获取权限列表（从常量）
  ↓
[5] 检查权限是否存在
  ├─ 是 → 记录审计日志(成功) → 继续
  └─ 否 → 记录审计日志(失败) → 返回 403
  ↓
[6] 执行业务逻辑
  ↓
[7] 返回响应
```

### 缓存策略

```rust
// 权限缓存 (TTL: 5 分钟)
pub struct PermissionCache {
    user_permissions: Arc<Mutex<LRUCache<String, Vec<String>>>>,
    ttl: Duration,
}

impl PermissionCache {
    pub async fn get_permissions(
        &self,
        user_id: &str,
    ) -> Result<Vec<String>, AppError> {
        // 先查缓存
        if let Some(perms) = self.user_permissions.lock().await.get(user_id) {
            return Ok(perms.clone());
        }

        // 缓存未命中，从数据库获取
        let roles = db_pool.get_user_roles(user_id).await?;
        let mut permissions = HashSet::new();

        for role in roles {
            let role_perms = crate::constants::roles::get_role_permissions(&role);
            permissions.extend(role_perms.iter().map(|s| s.to_string()));
        }

        let perms_vec: Vec<String> = permissions.into_iter().collect();
        self.user_permissions
            .lock()
            .await
            .insert(user_id.to_string(), perms_vec.clone());

        Ok(perms_vec)
    }

    pub async fn invalidate(&self, user_id: &str) {
        self.user_permissions.lock().await.remove(user_id);
    }
}
```

---

## 验证和测试

### 单元测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_super_admin_permissions() {
        let perms = get_role_permissions("super_admin");
        assert!(perms.contains(&"users.delete"));
        assert!(perms.contains(&"clients.view_secret"));
        // 不应包含权限定义修改
        assert!(!perms.contains(&"permissions.create"));
    }

    #[test]
    fn test_admin_permissions() {
        let perms = get_role_permissions("admin");
        assert!(perms.contains(&"users.create"));
        assert!(perms.contains(&"roles.read"));
        // 不应包含危险操作
        assert!(!perms.contains(&"users.delete"));
        assert!(!perms.contains(&"clients.delete"));
    }

    #[test]
    fn test_user_permissions() {
        let perms = get_role_permissions("user");
        // 用户仅能访问自己的资源
        assert_eq!(perms.len(), 3);
        assert!(perms.contains(&"users.read"));
    }

    #[tokio::test]
    async fn test_permission_escalation_prevention() {
        // 确保 Admin 无法修改 Super Admin 用户
        let actor = create_admin_user().await;
        let target = create_super_admin_user().await;

        let can_update = PermissionService::can_access_user(
            &actor.id,
            &target.id,
            "update",
            &state,
        )
        .await;

        assert!(can_update.is_ok_and(|b| !b));
    }
}
```

### 集成测试

```rust
#[tokio::test]
async fn test_rbac_flow() {
    // 1. 创建用户
    let admin = create_user_with_role("admin").await;
    let user = create_user_with_role("user").await;

    // 2. Admin 可以列出用户
    let list_result = admin.list_users().await;
    assert!(list_result.is_ok());

    // 3. User 无法列出用户
    let list_result = user.list_users().await;
    assert!(list_result.is_err());

    // 4. 用户可以修改自己的密码
    let update_result = user.update_own_password("new_password").await;
    assert!(update_result.is_ok());
}
```

### 权限冲突检查

```rust
pub async fn validate_role_permissions(
    role_id: &str,
    permissions: &[String],
) -> Result<(), AppError> {
    // 检查是否包含互斥的权限组合
    let has_create = permissions.contains(&"users.create".to_string());
    let has_delete = permissions.contains(&"users.delete".to_string());

    if has_create && !has_delete {
        // 如果可以创建用户，应该也能删除（对于管理员角色）
        tracing::warn!("Inconsistent permissions: can create but not delete");
    }

    // 检查权限是否匹配角色类型
    let role = db_pool.get_role(role_id).await?;

    if role.role_type == "custom" {
        // 自定义角色不应包含系统管理权限
        let system_permissions = vec![
            "clients.create",
            "clients.delete",
            "clients.rotate_secret",
            "permissions.create",
        ];

        for perm in permissions {
            if system_permissions.contains(&perm.as_str()) {
                return Err(AppError::BadRequest(
                    "Custom roles cannot have system permissions".into(),
                ));
            }
        }
    }

    Ok(())
}
```

---

## 审计和监控

### 权限变更审计

```rust
pub async fn log_role_assignment(
    user_id: &str,
    role_id: &str,
    assigned_by: &str,
    reason: Option<&str>,
    state: &Arc<AppState>,
) -> Result<(), AppError> {
    state
        .audit_log
        .create_entry(AuditLogEntry {
            user_id: user_id.to_string(),
            action_type: "ROLE_ASSIGNED".to_string(),
            resource_type: "role".to_string(),
            resource_id: role_id.to_string(),
            assigned_by: assigned_by.to_string(),
            reason: reason.map(|s| s.to_string()),
            status: "success".to_string(),
            timestamp: Utc::now(),
        })
        .await?;

    // 失效用户权限缓存
    state.permission_cache.invalidate(user_id).await;

    Ok(())
}
```

---

**文档状态**: ✅ 已发布
**下一版本**: 2026-02-20
**维护者**: 架构团队
