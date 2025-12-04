use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 权限类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "PermissionType", rename_all = "UPPERCASE")]
pub enum PermissionType {
    API,  // API权限
    MENU, // 菜单权限
    DATA, // 数据权限
}

/// 代表系统中的一个权限
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Permission {
    /// 权限的唯一标识符 (UUID)
    pub id: String,
    /// 权限的唯一名称
    pub name: String,
    /// 权限的显示名称
    pub display_name: String,
    /// 权限的描述
    pub description: Option<String>,
    /// 权限关联的资源
    pub resource: String,
    /// 权限关联的操作
    pub action: String,
    /// 权限类型
    pub r#type: PermissionType,
    /// 是否为系统权限
    pub is_system_perm: bool,
    /// 是否激活
    pub is_active: bool,
    /// 记录创建时间
    pub created_at: DateTime<Utc>,
    /// 记录更新时间
    pub updated_at: DateTime<Utc>,
}
