//! 安全头中间件测试
//!
//! 测试所有HTTP响应是否包含必需的安全头
//!
//! 测试的安全头包括:
//! - X-Content-Type-Options: nosniff
//! - X-Frame-Options: DENY
//! - X-XSS-Protection: 1; mode=block
//! - Referrer-Policy: strict-origin-when-cross-origin
//! - Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
//! - Strict-Transport-Security (仅生产环境)
//! - Permissions-Policy
//!
//! 参考: OWASP Secure Headers Project

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use oauth_service_rust::{app::create_app, config::Config};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower::util::ServiceExt;

// ============================================================================
// 测试辅助函数
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

/// 验证响应包含指定的安全头
fn assert_security_header(response: &axum::http::Response<axum::body::Body>, header_name: &str, expected_value: &str) {
    let header_value = response.headers().get(header_name);
    assert!(
        header_value.is_some(),
        "Security header '{}' is missing",
        header_name
    );

    if let Some(value) = header_value {
        let value_str = value.to_str().unwrap();
        assert!(
            value_str.contains(expected_value),
            "Security header '{}' has incorrect value. Expected to contain '{}', got '{}'",
            header_name,
            expected_value,
            value_str
        );
    }
}

// ============================================================================
// X-Content-Type-Options 测试
// ============================================================================

#[tokio::test]
async fn test_x_content_type_options_header() {
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

    assert_security_header(&response, "x-content-type-options", "nosniff");
}

// ============================================================================
// X-Frame-Options 测试
// ============================================================================

#[tokio::test]
async fn test_x_frame_options_header() {
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

    assert_security_header(&response, "x-frame-options", "DENY");
}

// ============================================================================
// X-XSS-Protection 测试
// ============================================================================

#[tokio::test]
async fn test_x_xss_protection_header() {
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

    assert_security_header(&response, "x-xss-protection", "1; mode=block");
}

// ============================================================================
// Referrer-Policy 测试
// ============================================================================

#[tokio::test]
async fn test_referrer_policy_header() {
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

    assert_security_header(&response, "referrer-policy", "strict-origin-when-cross-origin");
}

// ============================================================================
// Content-Security-Policy 测试
// ============================================================================

#[tokio::test]
async fn test_content_security_policy_header() {
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

    let csp_header = response.headers().get("content-security-policy");
    assert!(
        csp_header.is_some(),
        "Content-Security-Policy header is missing"
    );

    if let Some(csp) = csp_header {
        let csp_str = csp.to_str().unwrap();
        // 验证CSP包含关键指令
        assert!(
            csp_str.contains("default-src 'self'"),
            "CSP should contain 'default-src 'self''"
        );
        assert!(
            csp_str.contains("frame-ancestors 'none'"),
            "CSP should contain 'frame-ancestors 'none''"
        );
    }
}

// ============================================================================
// Permissions-Policy 测试
// ============================================================================

#[tokio::test]
async fn test_permissions_policy_header() {
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

    let permissions_policy = response.headers().get("permissions-policy");
    assert!(
        permissions_policy.is_some(),
        "Permissions-Policy header is missing"
    );

    if let Some(policy) = permissions_policy {
        let policy_str = policy.to_str().unwrap();
        // 验证禁用了敏感功能
        assert!(
            policy_str.contains("geolocation=()") || policy_str.contains("camera=()"),
            "Permissions-Policy should restrict sensitive features"
        );
    }
}

// ============================================================================
// 所有安全头综合测试
// ============================================================================

#[tokio::test]
async fn test_all_security_headers_present() {
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

    // 验证所有必需的安全头都存在
    let required_headers = vec![
        "x-content-type-options",
        "x-frame-options",
        "x-xss-protection",
        "referrer-policy",
        "content-security-policy",
        "permissions-policy",
    ];

    for header_name in required_headers {
        assert!(
            response.headers().get(header_name).is_some(),
            "Required security header '{}' is missing",
            header_name
        );
    }
}

// ============================================================================
// 不同端点的安全头测试
// ============================================================================

#[tokio::test]
async fn test_security_headers_on_oauth_endpoints() {
    let (app, _) = setup_test_app().await;

    // 测试OAuth授权端点
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/oauth/authorize?client_id=test&redirect_uri=http://localhost&response_type=code&state=test&code_challenge=test&code_challenge_method=S256")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 验证关键安全头
    assert!(response.headers().get("x-frame-options").is_some());
    assert!(response.headers().get("content-security-policy").is_some());
}

#[tokio::test]
async fn test_security_headers_on_api_endpoints() {
    let (app, _) = setup_test_app().await;

    // 测试API端点
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

    // 验证关键安全头
    assert!(response.headers().get("x-content-type-options").is_some());
    assert!(response.headers().get("x-xss-protection").is_some());
}

#[tokio::test]
async fn test_security_headers_on_error_responses() {
    let (app, _) = setup_test_app().await;

    // 访问不存在的端点
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/nonexistent")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 即使是错误响应，也应该包含安全头
    assert!(
        response.headers().get("x-frame-options").is_some(),
        "Error responses should also include security headers"
    );
}

// ============================================================================
// 不同HTTP方法的安全头测试
// ============================================================================

#[tokio::test]
async fn test_security_headers_on_post_request() {
    let (app, _) = setup_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/oauth/token")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"grant_type":"client_credentials"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    // POST请求的响应也应该包含安全头
    assert!(response.headers().get("x-content-type-options").is_some());
    assert!(response.headers().get("x-frame-options").is_some());
}

#[tokio::test]
async fn test_security_headers_on_options_request() {
    let (app, _) = setup_test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v2/health")
                .method("OPTIONS")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // OPTIONS请求的响应也应该包含安全头
    // 注意：某些实现可能在OPTIONS响应中省略某些安全头
    let has_security_headers = response.headers().get("x-frame-options").is_some()
        || response.headers().get("x-content-type-options").is_some();

    assert!(
        has_security_headers || response.status() == StatusCode::METHOD_NOT_ALLOWED,
        "OPTIONS requests should include security headers or return 405"
    );
}

// ============================================================================
// CSP指令详细测试
// ============================================================================

#[tokio::test]
async fn test_csp_prevents_inline_scripts() {
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

    let csp = response.headers().get("content-security-policy");
    if let Some(csp_value) = csp {
        let csp_str = csp_value.to_str().unwrap();
        // CSP应该限制脚本来源
        // 如果没有script-src指令，default-src会应用到脚本
        assert!(
            csp_str.contains("script-src") || csp_str.contains("default-src 'self'"),
            "CSP should restrict script sources"
        );
    }
}

#[tokio::test]
async fn test_csp_prevents_framing() {
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

    let csp = response.headers().get("content-security-policy");
    if let Some(csp_value) = csp {
        let csp_str = csp_value.to_str().unwrap();
        // CSP应该包含frame-ancestors指令防止点击劫持
        assert!(
            csp_str.contains("frame-ancestors 'none'") || csp_str.contains("frame-ancestors 'self'"),
            "CSP should include frame-ancestors directive"
        );
    }
}
