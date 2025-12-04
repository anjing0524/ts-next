#![allow(clippy::uninlined_format_args)]
// 审计日志服务 (Audit Log Service)

use crate::error::ServiceError;
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::sync::Arc;

/// 审计日志项
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AuditLogEntry {
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

/// 审计日志查询条件
pub struct AuditLogQuery {
    pub page: u32,
    pub limit: u32,
    pub action: Option<String>,
    pub user_id: Option<String>,
    pub resource_type: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

/// 审计日志查询结果
pub struct AuditLogQueryResult {
    pub data: Vec<AuditLogEntry>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

#[async_trait]
pub trait AuditLogService: Send + Sync {
    async fn list_audit_logs(&self, query: AuditLogQuery) -> Result<AuditLogQueryResult, ServiceError>;
    async fn export_audit_logs(&self, query: AuditLogQuery) -> Result<Vec<AuditLogEntry>, ServiceError>;
}

pub struct AuditLogServiceImpl {
    db: Arc<SqlitePool>,
}

impl AuditLogServiceImpl {
    pub fn new(db: Arc<SqlitePool>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl AuditLogService for AuditLogServiceImpl {
    async fn list_audit_logs(&self, query: AuditLogQuery) -> Result<AuditLogQueryResult, ServiceError> {
        let page = query.page.max(1);
        let limit = query.limit.min(500).max(1);
        let offset = (page - 1) * limit;

        // 构建查询条件
        let mut sql = String::from(
            "SELECT id, timestamp, user_id, actor_type, actor_id, action, resource_type, resource_id, details, status, ip_address, user_agent FROM audit_logs WHERE 1=1"
        );
        let mut count_sql = String::from("SELECT COUNT(*) as total FROM audit_logs WHERE 1=1");
        let mut args: Vec<String> = vec![];

        if let Some(action) = &query.action {
            sql.push_str(" AND action = ?");
            count_sql.push_str(" AND action = ?");
            args.push(action.clone());
        }
        if let Some(user_id) = &query.user_id {
            sql.push_str(" AND user_id = ?");
            count_sql.push_str(" AND user_id = ?");
            args.push(user_id.clone());
        }
        if let Some(resource_type) = &query.resource_type {
            sql.push_str(" AND resource_type = ?");
            count_sql.push_str(" AND resource_type = ?");
            args.push(resource_type.clone());
        }
        if let Some(start_date) = &query.start_date {
            sql.push_str(" AND timestamp >= ?");
            count_sql.push_str(" AND timestamp >= ?");
            args.push(start_date.clone());
        }
        if let Some(end_date) = &query.end_date {
            sql.push_str(" AND timestamp < ?");
            count_sql.push_str(" AND timestamp < ?");
            args.push(end_date.clone());
        }

        sql.push_str(" ORDER BY timestamp DESC LIMIT ? OFFSET ?");

        // 执行计数查询
        let total: i64 = {
            let mut query_builder = sqlx::query_scalar::<_, i64>(&count_sql);
            for arg in &args {
                query_builder = query_builder.bind(arg.clone());
            }
            query_builder
                .fetch_one(&*self.db)
                .await
                .unwrap_or(0)
        };

        // 执行数据查询
        let logs: Vec<AuditLogEntry> = {
            let mut query_builder = sqlx::query_as::<_, AuditLogEntry>(&sql);
            for arg in &args {
                query_builder = query_builder.bind(arg.clone());
            }
            query_builder = query_builder.bind(limit as i32).bind(offset as i32);
            query_builder
                .fetch_all(&*self.db)
                .await
                .unwrap_or_default()
        };

        let total_pages = (total as u32 + limit - 1) / limit;

        Ok(AuditLogQueryResult {
            data: logs,
            total,
            page,
            page_size: limit,
            total_pages,
        })
    }

    async fn export_audit_logs(&self, query: AuditLogQuery) -> Result<Vec<AuditLogEntry>, ServiceError> {
        // 构建查询条件
        let mut sql = String::from(
            "SELECT id, timestamp, user_id, actor_type, actor_id, action, resource_type, resource_id, details, status, ip_address, user_agent FROM audit_logs WHERE 1=1"
        );
        let mut args: Vec<String> = vec![];

        if let Some(action) = &query.action {
            sql.push_str(" AND action = ?");
            args.push(action.clone());
        }
        if let Some(user_id) = &query.user_id {
            sql.push_str(" AND user_id = ?");
            args.push(user_id.clone());
        }
        if let Some(resource_type) = &query.resource_type {
            sql.push_str(" AND resource_type = ?");
            args.push(resource_type.clone());
        }
        if let Some(start_date) = &query.start_date {
            sql.push_str(" AND timestamp >= ?");
            args.push(start_date.clone());
        }
        if let Some(end_date) = &query.end_date {
            sql.push_str(" AND timestamp < ?");
            args.push(end_date.clone());
        }

        sql.push_str(" ORDER BY timestamp DESC");

        // 执行查询
        let logs: Vec<AuditLogEntry> = {
            let mut query_builder = sqlx::query_as::<_, AuditLogEntry>(&sql);
            for arg in &args {
                query_builder = query_builder.bind(arg.clone());
            }
            query_builder
                .fetch_all(&*self.db)
                .await
                .unwrap_or_default()
        };

        Ok(logs)
    }
}
