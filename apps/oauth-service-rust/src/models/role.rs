use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 代表系统中的一个角色
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    /// 角色的唯一标识符 (UUID)
    pub id: String,
    /// 角色的唯一名称
    pub name: String,
    /// 角色的显示名称
    pub display_name: String,
    /// 角色的描述
    pub description: Option<String>,
    /// 是否为系统角色
    pub is_system_role: bool,
    /// 是否激活
    pub is_active: bool,
    /// 记录创建时间
    pub created_at: DateTime<Utc>,
    /// 记录更新时间
    pub updated_at: DateTime<Utc>,
}
