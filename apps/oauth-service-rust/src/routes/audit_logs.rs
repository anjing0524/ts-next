// 审计日志管理 API
// Audit logs export and query API

use crate::{
    error::AppError,
    middleware::auth::AuthContext,
    services::audit_log_service::AuditLogQuery,
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct ListAuditLogsQuery {
    /// 页码，从1开始
    #[serde(default = "default_page")]
    pub page: u32,
    /// 每页数量，最多500条
    #[serde(default = "default_limit")]
    pub limit: u32,
    /// 操作类型过滤
    pub action: Option<String>,
    /// 用户ID过滤
    pub user_id: Option<String>,
    /// 资源类型过滤
    pub resource_type: Option<String>,
    /// 开始日期 (ISO 8601 格式，例如：2025-01-01T00:00:00Z)
    pub start_date: Option<String>,
    /// 结束日期 (ISO 8601 格式，例如：2025-12-31T23:59:59Z)
    pub end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    /// 导出格式：csv 或 json
    #[serde(default = "default_format")]
    pub format: String,
    /// 开始日期
    pub start_date: Option<String>,
    /// 结束日期
    pub end_date: Option<String>,
    /// 操作类型过滤
    pub action: Option<String>,
    /// 用户ID过滤
    pub user_id: Option<String>,
}

fn default_page() -> u32 {
    1
}

fn default_limit() -> u32 {
    50
}

fn default_format() -> String {
    "json".to_string()
}

#[derive(Debug, Serialize)]
pub struct AuditLogResponse {
    pub data: Vec<AuditLogResponseEntry>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

#[derive(Debug, Serialize)]
pub struct AuditLogResponseEntry {
    pub id: String,
    pub timestamp: String,
    pub user_id: Option<String>,
    pub actor_type: String,
    pub actor_id: String,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub details: Option<String>,
    pub status: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// 获取审计日志列表 - 支持分页和过滤
/// GET /api/v2/admin/audit-logs?page=1&limit=50&action=LOGIN&user_id=xxx&start_date=2025-01-01T00:00:00Z&end_date=2025-12-31T23:59:59Z
pub async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListAuditLogsQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<AuditLogResponse>, AppError> {
    let audit_query = AuditLogQuery {
        page: query.page,
        limit: query.limit,
        action: query.action,
        user_id: query.user_id,
        resource_type: query.resource_type,
        start_date: query.start_date,
        end_date: query.end_date,
    };

    let result = state.audit_log_service.list_audit_logs(audit_query).await?;

    let entries: Vec<AuditLogResponseEntry> = result
        .data
        .into_iter()
        .map(|log| AuditLogResponseEntry {
            id: log.id,
            timestamp: log.timestamp,
            user_id: log.user_id,
            actor_type: log.actor_type,
            actor_id: log.actor_id,
            action: log.action,
            resource_type: log.resource_type,
            resource_id: log.resource_id,
            details: log.details,
            status: log.status,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
        })
        .collect();

    Ok(Json(AuditLogResponse {
        data: entries,
        total: result.total,
        page: result.page,
        page_size: result.page_size,
        total_pages: result.total_pages,
    }))
}

/// 导出审计日志为CSV或JSON格式
/// GET /api/v2/admin/audit-logs/export?format=csv&start_date=2025-01-01&end_date=2025-12-31
pub async fn export_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<impl IntoResponse, AppError> {
    let format = query.format.to_lowercase();

    let audit_query = AuditLogQuery {
        page: 1,
        limit: 10000,
        action: query.action,
        user_id: query.user_id,
        resource_type: None,
        start_date: query.start_date,
        end_date: query.end_date,
    };

    let logs = state.audit_log_service.export_audit_logs(audit_query).await?;

    if format == "csv" {
        Ok(export_as_csv(logs).into_response())
    } else {
        let entries: Vec<AuditLogResponseEntry> = logs
            .into_iter()
            .map(|log| AuditLogResponseEntry {
                id: log.id,
                timestamp: log.timestamp,
                user_id: log.user_id,
                actor_type: log.actor_type,
                actor_id: log.actor_id,
                action: log.action,
                resource_type: log.resource_type,
                resource_id: log.resource_id,
                details: log.details,
                status: log.status,
                ip_address: log.ip_address,
                user_agent: log.user_agent,
            })
            .collect();
        Ok((StatusCode::OK, Json(entries)).into_response())
    }
}

/// 将审计日志转换为CSV格式
fn export_as_csv(logs: Vec<crate::services::audit_log_service::AuditLogEntry>) -> impl IntoResponse {
    let mut csv = String::from(
        "ID,Timestamp,User ID,Actor Type,Actor ID,Action,Resource Type,Resource ID,Details,Status,IP Address,User Agent\n",
    );

    for log in logs {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            escape_csv(&log.id),
            escape_csv(&log.timestamp),
            log.user_id.as_deref().unwrap_or(""),
            escape_csv(&log.actor_type),
            escape_csv(&log.actor_id),
            escape_csv(&log.action),
            log.resource_type.as_deref().unwrap_or(""),
            log.resource_id.as_deref().unwrap_or(""),
            log.details.as_deref().unwrap_or(""),
            escape_csv(&log.status),
            log.ip_address.as_deref().unwrap_or(""),
            log.user_agent.as_deref().unwrap_or(""),
        ));
    }

    (
        StatusCode::OK,
        [
            ("Content-Type", "text/csv; charset=utf-8"),
            (
                "Content-Disposition",
                "attachment; filename=\"audit-logs.csv\"",
            ),
        ],
        csv,
    )
}

/// CSV中的转义函数 - 处理包含引号和换行的字段
fn escape_csv(field: &str) -> String {
    if field.contains('"') || field.contains(',') || field.contains('\n') {
        field.replace('"', "\"\"")
    } else {
        field.to_string()
    }
}
