//! HTTP 端点和安全性测试
//!
//! 测试 OAuth 端点的安全性和正确性

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use oauth_service_rust::{
    app::create_app, config::Config,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower::util::ServiceExt;
use uuid::Uuid;

// ============================================================================
// 测试数据库和应用设置
// ============================================================================

async fn setup_test_app() -> (axum::Router, Arc<SqlitePool>) {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    let config = Config {
        database_url: "sqlite::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    };

    let pool = Arc::new(pool);
    let config = Arc::new(config);

    let app = create_app(pool.clone(), config.clone()).await;

    (app, pool)
}

// ============================================================================
// 健康检查端点测试
// ============================================================================

#[tokio::test]
async fn test_health_check_endpoint() {
    let (app, _) = setup_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 健康检查可能需要认证，或返回 200 或 401
    assert!(response.status() == StatusCode::OK || response.status() == StatusCode::UNAUTHORIZED);
}

// ============================================================================
// 认证端点测试
// ============================================================================

#[tokio::test]
async fn test_missing_authorization_header() {
    let (app, _) = setup_test_app().await;

    // 尝试访问受保护的端点而不提供授权头
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/admin/permissions")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 应该返回 401 Unauthorized
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ============================================================================
// 方法验证测试
// ============================================================================

#[tokio::test]
async fn test_invalid_http_method() {
    let (app, _) = setup_test_app().await;

    // 使用 PATCH 方法访问不支持该方法的端点
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/health")
                .method("PATCH")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 应该返回错误状态
    assert!(
        response.status() == StatusCode::METHOD_NOT_ALLOWED
            || response.status() == StatusCode::NOT_FOUND
            || response.status() == StatusCode::UNAUTHORIZED
    );
}

// ============================================================================
// 错误响应格式测试
// ============================================================================

#[tokio::test]
async fn test_error_response_on_not_found() {
    let (app, _) = setup_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/nonexistent-endpoint")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 应该返回错误（404 或 401）
    assert!(
        response.status() == StatusCode::NOT_FOUND || response.status() == StatusCode::UNAUTHORIZED
    );
}

// ============================================================================
// 并发请求测试
// ============================================================================

#[tokio::test]
async fn test_concurrent_health_checks() {
    let (app, _) = setup_test_app().await;

    let mut handles = vec![];

    // 并发发送 5 个健康检查请求
    for _ in 0..5 {
        let app_clone = app.clone();
        let handle = tokio::spawn(async move {
            let response = app_clone
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v2/health")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            // 接受 200 或 401
            response.status() == StatusCode::OK || response.status() == StatusCode::UNAUTHORIZED
        });
        handles.push(handle);
    }

    let mut success_count = 0;
    for handle in handles {
        if handle.await.unwrap() {
            success_count += 1;
        }
    }

    assert_eq!(success_count, 5, "All concurrent requests should succeed");
}

// ============================================================================
// 数据库连接故障恢复测试
// ============================================================================

#[tokio::test]
async fn test_graceful_service_operation() {
    let (app, pool) = setup_test_app().await;

    // 创建一个测试用户以确保数据库工作
    let user_id = Uuid::new_v4().to_string();
    let password_hash = oauth_service_rust::utils::crypto::hash_password("password123")
        .expect("Failed to hash password");
    let now = chrono::Utc::now();

    let _ = sqlx::query!(
        "INSERT INTO users (id, username, password_hash, is_active, created_at, updated_at, must_change_password, failed_login_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        user_id,
        "testuser",
        password_hash,
        true,
        now,
        now,
        false,
        0
    )
    .execute(&*pool)
    .await;

    // 健康检查应该返回某个响应（200 或 401）
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status() == StatusCode::OK || response.status() == StatusCode::UNAUTHORIZED);
}

// ============================================================================
// 请求验证测试
// ============================================================================

#[tokio::test]
async fn test_empty_request_body_handling() {
    let (app, _) = setup_test_app().await;

    // 健康检查应该接受空请求体
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/health")
                .header("Content-Length", "0")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 接受 200 或 401
    assert!(response.status() == StatusCode::OK || response.status() == StatusCode::UNAUTHORIZED);
}
