use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::rbac::PaginatedResponse;
use serde::{Deserialize, Serialize};

/// 审计日志 AuditLog 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub id: String,
    pub actor_id: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: String,
    pub status: String,  // "success" | "failure"
    pub details: serde_json::Value,
    pub created_at: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// 审计日志过滤器 AuditLogFilter 结构
#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogFilter {
    pub actor_id: Option<String>,
    pub resource_type: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

/// 审计模块 AuditModule
pub struct AuditModule {
    http_client: HttpClient,
}

impl AuditModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    /// 获取审计日志列表 get_logs
    /// GET /api/v2/audit/logs with query params
    pub async fn get_logs(
        &self,
        filter: Option<AuditLogFilter>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<AuditLog>> {
        let mut query_params = format!("?page={}&page_size={}", page.unwrap_or(1), page_size.unwrap_or(10));

        if let Some(f) = filter {
            if let Some(actor_id) = f.actor_id {
                query_params.push_str(&format!("&actor_id={}", actor_id));
            }
            if let Some(resource_type) = f.resource_type {
                query_params.push_str(&format!("&resource_type={}", resource_type));
            }
            if let Some(action) = f.action {
                query_params.push_str(&format!("&action={}", action));
            }
            if let Some(status) = f.status {
                query_params.push_str(&format!("&status={}", status));
            }
            if let Some(start_time) = f.start_time {
                query_params.push_str(&format!("&start_time={}", start_time));
            }
            if let Some(end_time) = f.end_time {
                query_params.push_str(&format!("&end_time={}", end_time));
            }
        }

        let path = format!("/api/v2/audit/logs{}", query_params);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<AuditLog>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 获取用户审计日志 get_user_logs
    /// GET /api/v2/audit/logs filtered by actor_id
    pub async fn get_user_logs(
        &self,
        user_id: String,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<AuditLog>> {
        let filter = AuditLogFilter {
            actor_id: Some(user_id),
            ..Default::default()
        };
        self.get_logs(Some(filter), page, page_size).await
    }
}

/// 为 AuditLogFilter 实现 Default trait
impl Default for AuditLogFilter {
    fn default() -> Self {
        Self {
            actor_id: None,
            resource_type: None,
            action: None,
            status: None,
            start_time: None,
            end_time: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_log_with_optional_fields() {
        // 验证 AuditLog 可选字段 - Verifies AuditLog optional fields
        let log = AuditLog {
            id: "audit123".to_string(),
            actor_id: "user123".to_string(),
            action: "user.login".to_string(),
            resource_type: "user".to_string(),
            resource_id: "user123".to_string(),
            status: "success".to_string(),
            details: serde_json::json!({"method": "password", "ip": "192.168.1.1"}),
            created_at: "2025-01-01T00:00:00Z".to_string(),
            ip_address: Some("192.168.1.1".to_string()),
            user_agent: Some("Mozilla/5.0".to_string()),
        };

        let json = serde_json::to_value(&log).unwrap();

        // 必需字段 - Required fields
        assert!(json.get("id").is_some());
        assert!(json.get("actor_id").is_some());
        assert!(json.get("action").is_some());
        assert!(json.get("status").is_some());

        // 可选字段 - Optional fields
        assert!(json.get("ip_address").is_some());
        assert!(json.get("user_agent").is_some());

        // details 应该是对象 - details should be object
        assert!(json["details"].is_object());
    }

    #[test]
    fn test_audit_log_without_optional_fields() {
        // 验证 AuditLog 无可选字段 - Verifies AuditLog without optional fields
        let log = AuditLog {
            id: "audit456".to_string(),
            actor_id: "user456".to_string(),
            action: "user.logout".to_string(),
            resource_type: "session".to_string(),
            resource_id: "session456".to_string(),
            status: "success".to_string(),
            details: serde_json::json!({}),
            created_at: "2025-01-01T00:00:00Z".to_string(),
            ip_address: None,
            user_agent: None,
        };

        let json = serde_json::to_value(&log).unwrap();

        // 可选字段应该为 null - Optional fields should be null
        assert!(json["ip_address"].is_null());
        assert!(json["user_agent"].is_null());
    }

    #[test]
    fn test_audit_log_filter_default() {
        // 验证 AuditLogFilter 默认值 - Verifies AuditLogFilter default
        let filter = AuditLogFilter::default();
        let json = serde_json::to_value(&filter).unwrap();

        // 所有字段应该为 null - All fields should be null
        assert!(json["actor_id"].is_null());
        assert!(json["resource_type"].is_null());
        assert!(json["action"].is_null());
        assert!(json["status"].is_null());
        assert!(json["start_time"].is_null());
        assert!(json["end_time"].is_null());
    }

    #[test]
    fn test_audit_log_filter_partial_fields() {
        // 验证 AuditLogFilter 部分字段 - Verifies AuditLogFilter with partial fields
        let filter = AuditLogFilter {
            actor_id: Some("user789".to_string()),
            status: Some("failure".to_string()),
            ..Default::default()
        };

        let json = serde_json::to_value(&filter).unwrap();

        // 有值的字段 - Fields with values
        assert!(!json["actor_id"].is_null());
        assert_eq!(json["actor_id"], "user789");
        assert!(!json["status"].is_null());
        assert_eq!(json["status"], "failure");

        // None 的字段 - Fields that are None
        assert!(json["resource_type"].is_null());
        assert!(json["action"].is_null());
    }

    #[test]
    fn test_audit_log_filter_all_fields() {
        // 验证 AuditLogFilter 所有字段 - Verifies AuditLogFilter with all fields
        let filter = AuditLogFilter {
            actor_id: Some("user123".to_string()),
            resource_type: Some("user".to_string()),
            action: Some("user.login".to_string()),
            status: Some("success".to_string()),
            start_time: Some("2025-01-01T00:00:00Z".to_string()),
            end_time: Some("2025-12-31T23:59:59Z".to_string()),
        };

        let json = serde_json::to_value(&filter).unwrap();

        // 所有字段都应该有值 - All fields should have values
        assert_eq!(json["actor_id"], "user123");
        assert_eq!(json["resource_type"], "user");
        assert_eq!(json["action"], "user.login");
        assert_eq!(json["status"], "success");
        assert!(json.get("start_time").is_some());
        assert!(json.get("end_time").is_some());
    }
}
