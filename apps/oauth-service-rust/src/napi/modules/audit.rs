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
