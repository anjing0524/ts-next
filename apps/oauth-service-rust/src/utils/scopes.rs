// OAuth 2.1 / OpenID Connect 权限范围定义
// 定义所有支持的权限及其元数据（描述、风险等级、分类）

use std::collections::HashMap;
use lazy_static::lazy_static;

/// 权限范围信息 (Scope Metadata)
#[derive(Clone, Debug)]
pub struct ScopeMetadata {
    /// 权限标识 (e.g., "openid", "profile")
    pub name: String,
    /// 显示名称（中文）
    pub display_name: String,
    /// 详细描述（中文）
    pub description: String,
    /// 英文描述
    pub description_en: String,
    /// 图标 emoji
    pub icon: String,
    /// 风险等级: "low", "medium", "high"
    pub risk_level: String,
    /// 分类: "Identity", "Profile", "Contact", "Access"
    pub category: String,
}

impl ScopeMetadata {
    pub fn new(
        name: &str,
        display_name: &str,
        description: &str,
        description_en: &str,
        icon: &str,
        risk_level: &str,
        category: &str,
    ) -> Self {
        Self {
            name: name.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            description_en: description_en.to_string(),
            icon: icon.to_string(),
            risk_level: risk_level.to_string(),
            category: category.to_string(),
        }
    }

    /// 判断是否为危险权限
    pub fn is_dangerous(&self) -> bool {
        self.risk_level == "high" || self.risk_level == "medium"
    }

    /// 获取风险等级的标签颜色
    pub fn risk_color(&self) -> &str {
        match self.risk_level.as_str() {
            "low" => "green",
            "medium" => "yellow",
            "high" => "red",
            _ => "gray",
        }
    }
}

// 标准 OpenID Connect 权限
lazy_static! {
    pub static ref SCOPE_OPENID: ScopeMetadata = ScopeMetadata::new(
        "openid",
        "唯一身份识别",
        "使用 OpenID Connect 标准验证您的身份",
        "OpenID Connect authentication",
        "🆔",
        "low",
        "Identity"
    );

    pub static ref SCOPE_PROFILE: ScopeMetadata = ScopeMetadata::new(
        "profile",
        "个人资料",
        "访问您的姓名、头像、生日等基本个人信息",
        "Access to name, picture, birthdate and other profile information",
        "👤",
        "low",
        "Profile"
    );

    pub static ref SCOPE_EMAIL: ScopeMetadata = ScopeMetadata::new(
        "email",
        "邮箱地址",
        "访问您的邮箱地址和邮箱验证状态",
        "Access to email address and email verification status",
        "📧",
        "low",
        "Contact"
    );

    pub static ref SCOPE_PHONE: ScopeMetadata = ScopeMetadata::new(
        "phone",
        "电话号码",
        "访问您的电话号码和验证状态",
        "Access to phone number and phone verification status",
        "📱",
        "medium",
        "Contact"
    );

    pub static ref SCOPE_ADDRESS: ScopeMetadata = ScopeMetadata::new(
        "address",
        "地址信息",
        "访问您的街道、城市、州、邮编等地址信息",
        "Access to street address, city, state, postal code and country",
        "📍",
        "medium",
        "Contact"
    );

    pub static ref SCOPE_OFFLINE_ACCESS: ScopeMetadata = ScopeMetadata::new(
        "offline_access",
        "离线访问",
        "即使您不在线，应用也可以代表您执行操作",
        "Allow app to access your data when you are offline",
        "🔄",
        "high",
        "Access"
    );

    // 详细个人资料权限
    pub static ref SCOPE_NAME: ScopeMetadata = ScopeMetadata::new(
        "name",
        "姓名",
        "访问您的全名或显示名称",
        "Access to your full name",
        "📝",
        "low",
        "Profile"
    );

    pub static ref SCOPE_PICTURE: ScopeMetadata = ScopeMetadata::new(
        "picture",
        "头像",
        "访问您的个人头像或照片",
        "Access to your profile picture",
        "🖼️",
        "low",
        "Profile"
    );

    pub static ref SCOPE_WEBSITE: ScopeMetadata = ScopeMetadata::new(
        "website",
        "网站",
        "访问您的个人网站或博客网址",
        "Access to your website URL",
        "🌐",
        "low",
        "Profile"
    );

    pub static ref SCOPE_GENDER: ScopeMetadata = ScopeMetadata::new(
        "gender",
        "性别",
        "访问您的性别信息",
        "Access to your gender",
        "⚧️",
        "low",
        "Profile"
    );

    pub static ref SCOPE_BIRTHDATE: ScopeMetadata = ScopeMetadata::new(
        "birthdate",
        "生日",
        "访问您的出生日期",
        "Access to your birthdate",
        "🎂",
        "medium",
        "Profile"
    );

    pub static ref SCOPE_LOCALE: ScopeMetadata = ScopeMetadata::new(
        "locale",
        "地区语言",
        "访问您偏好的语言和地区设置",
        "Access to your preferred language and locale",
        "🌍",
        "low",
        "Profile"
    );

    // 管理员和高级权限
    pub static ref SCOPE_ADMIN: ScopeMetadata = ScopeMetadata::new(
        "admin",
        "管理员权限",
        "完全管理员访问权限，可管理所有资源",
        "Full administrative access to manage all resources",
        "👑",
        "high",
        "Access"
    );

    // 资源操作权限
    pub static ref SCOPE_READ_USERS: ScopeMetadata = ScopeMetadata::new(
        "read:users",
        "读取用户信息",
        "查看用户列表和用户详细信息",
        "View user list and user details",
        "👥",
        "medium",
        "Access"
    );

    pub static ref SCOPE_WRITE_USERS: ScopeMetadata = ScopeMetadata::new(
        "write:users",
        "管理用户",
        "创建、修改和删除用户账户",
        "Create, modify and delete user accounts",
        "🔧",
        "high",
        "Access"
    );

    pub static ref SCOPE_READ_ROLES: ScopeMetadata = ScopeMetadata::new(
        "read:roles",
        "读取角色",
        "查看系统角色和权限配置",
        "View system roles and permissions",
        "📋",
        "medium",
        "Access"
    );

    pub static ref SCOPE_WRITE_ROLES: ScopeMetadata = ScopeMetadata::new(
        "write:roles",
        "管理角色",
        "创建和修改系统角色和权限",
        "Manage system roles and permissions",
        "⚙️",
        "high",
        "Access"
    );

    pub static ref SCOPE_READ_AUDIT: ScopeMetadata = ScopeMetadata::new(
        "read:audit",
        "读取审计日志",
        "查看系统的安全审计日志",
        "View system security audit logs",
        "📊",
        "medium",
        "Access"
    );

    // 权限范围注册表
    pub static ref SCOPES: HashMap<String, &'static ScopeMetadata> = {
        let mut map = HashMap::new();

        // OpenID Connect 标准权限
        map.insert("openid".to_string(), &*SCOPE_OPENID);
        map.insert("profile".to_string(), &*SCOPE_PROFILE);
        map.insert("email".to_string(), &*SCOPE_EMAIL);
        map.insert("phone".to_string(), &*SCOPE_PHONE);
        map.insert("address".to_string(), &*SCOPE_ADDRESS);
        map.insert("offline_access".to_string(), &*SCOPE_OFFLINE_ACCESS);

        // 详细资料权限
        map.insert("name".to_string(), &*SCOPE_NAME);
        map.insert("picture".to_string(), &*SCOPE_PICTURE);
        map.insert("website".to_string(), &*SCOPE_WEBSITE);
        map.insert("gender".to_string(), &*SCOPE_GENDER);
        map.insert("birthdate".to_string(), &*SCOPE_BIRTHDATE);
        map.insert("locale".to_string(), &*SCOPE_LOCALE);

        // 管理权限
        map.insert("admin".to_string(), &*SCOPE_ADMIN);
        map.insert("read:users".to_string(), &*SCOPE_READ_USERS);
        map.insert("write:users".to_string(), &*SCOPE_WRITE_USERS);
        map.insert("read:roles".to_string(), &*SCOPE_READ_ROLES);
        map.insert("write:roles".to_string(), &*SCOPE_WRITE_ROLES);
        map.insert("read:audit".to_string(), &*SCOPE_READ_AUDIT);

        map
    };
}

/// 根据权限名称获取权限元数据
pub fn get_scope_metadata(scope_name: &str) -> Option<&'static ScopeMetadata> {
    SCOPES.get(scope_name).copied()
}

/// 获取权限的中文描述
pub fn get_scope_description_cn(scope_name: &str) -> String {
    get_scope_metadata(scope_name)
        .map(|meta| meta.description.clone())
        .unwrap_or_else(|| format!("权限 {}", scope_name))
}

/// 获取权限的英文描述
pub fn get_scope_description_en(scope_name: &str) -> String {
    get_scope_metadata(scope_name)
        .map(|meta| meta.description_en.clone())
        .unwrap_or_else(|| format!("Scope {}", scope_name))
}

/// 从权限字符串列表提取元数据
pub fn parse_scopes(scope_string: &str) -> Vec<&'static ScopeMetadata> {
    scope_string
        .split_whitespace()
        .filter_map(get_scope_metadata)
        .collect()
}

/// 检查是否有危险权限
pub fn has_dangerous_scopes(scope_string: &str) -> bool {
    parse_scopes(scope_string)
        .iter()
        .any(|scope| scope.is_dangerous())
}

/// 按分类分组权限
pub fn group_scopes_by_category(scope_string: &str) -> std::collections::BTreeMap<String, Vec<&'static ScopeMetadata>> {
    let mut groups: std::collections::BTreeMap<String, Vec<&'static ScopeMetadata>> = std::collections::BTreeMap::new();

    for scope in parse_scopes(scope_string) {
        groups
            .entry(scope.category.clone())
            .or_insert_with(Vec::new)
            .push(scope);
    }

    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scope_metadata() {
        let scope = get_scope_metadata("openid").unwrap();
        assert_eq!(scope.name, "openid");
        assert_eq!(scope.risk_level, "low");
        assert!(!scope.is_dangerous());
    }

    #[test]
    fn test_dangerous_scope_detection() {
        assert!(!get_scope_metadata("openid").unwrap().is_dangerous());
        assert!(get_scope_metadata("offline_access").unwrap().is_dangerous());
        assert!(get_scope_metadata("write:users").unwrap().is_dangerous());
    }

    #[test]
    fn test_parse_scopes() {
        let scopes = parse_scopes("openid profile email");
        assert_eq!(scopes.len(), 3);
        assert_eq!(scopes[0].name, "openid");
    }

    #[test]
    fn test_has_dangerous_scopes() {
        assert!(!has_dangerous_scopes("openid profile"));
        assert!(has_dangerous_scopes("openid offline_access"));
        assert!(has_dangerous_scopes("write:users"));
    }

    #[test]
    fn test_group_scopes_by_category() {
        let groups = group_scopes_by_category("openid profile email phone");
        assert!(groups.contains_key("Identity"));
        assert!(groups.contains_key("Profile"));
        assert!(groups.contains_key("Contact"));
    }
}
