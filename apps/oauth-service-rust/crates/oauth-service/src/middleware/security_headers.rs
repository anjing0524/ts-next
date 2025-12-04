// 安全头部中间件 (Security Headers Middleware)
// Adds required security HTTP headers to all responses

use axum::{
    extract::Request,
    http::header::{HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};

/// 添加安全头部到所有响应
/// Security headers include:
/// - X-Content-Type-Options: nosniff - 防止MIME sniffing
/// - X-Frame-Options: DENY - 防止点击劫持
/// - X-XSS-Protection: 1; mode=block - 防止XSS攻击
/// - Content-Security-Policy: 限制脚本执行
/// - Strict-Transport-Security: 强制HTTPS（仅生产环境）
/// - Referrer-Policy: 控制引荐信息
pub async fn security_headers_middleware(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;

    // X-Content-Type-Options: 防止浏览器MIME sniffing
    // 告诉浏览器严格遵循Content-Type头而不尝试猜测
    response.headers_mut().insert(
        HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );

    // X-Frame-Options: 防止clickjacking (点击劫持)
    // DENY 表示该页面不能被任何其他网站的frame/iframe加载
    response.headers_mut().insert(
        HeaderName::from_static("x-frame-options"),
        HeaderValue::from_static("DENY"),
    );

    // X-XSS-Protection: 启用浏览器的XSS过滤
    // 仅在较旧的浏览器中有效，现代浏览器使用CSP
    response.headers_mut().insert(
        HeaderName::from_static("x-xss-protection"),
        HeaderValue::from_static("1; mode=block"),
    );

    // Referrer-Policy: 控制referrer信息的披露
    // strict-origin-when-cross-origin: 仅在跨域请求中发送源信息
    response.headers_mut().insert(
        HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    // Content-Security-Policy: 防止XSS攻击和其他注入攻击
    // default-src 'self': 仅允许来自同源的资源
    // frame-ancestors 'none': 不允许在frame中加载
    // object-src 'none': 禁止插件加载
    response.headers_mut().insert(
        HeaderName::from_static("content-security-policy"),
        HeaderValue::from_static(
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
        ),
    );

    // Strict-Transport-Security: 强制使用HTTPS
    // 仅在生产环境启用
    let is_production = std::env::var("ENVIRONMENT")
        .map(|e| e == "production")
        .unwrap_or(false);

    if is_production {
        response.headers_mut().insert(
            HeaderName::from_static("strict-transport-security"),
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        );
    }

    // Permissions-Policy: 控制浏览器特性访问权限
    response.headers_mut().insert(
        HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
    );

    response
}
