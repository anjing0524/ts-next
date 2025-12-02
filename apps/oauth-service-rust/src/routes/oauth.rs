use crate::error::{AppError, ServiceError};
use crate::models::client::OAuthClientDetails;
use crate::state::AppState;
use crate::utils::{pkce, validation};
use axum::{
    extract::{Form, Json as JsonExtractor, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Redirect},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time;
// 使用编译期常量替代lazy_static，避免panic风险
const DEFAULT_IP: std::net::IpAddr = std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1));

// --- Login Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct LoginRequest {
    username: String,
    password: String,
    redirect: Option<String>, // The URL to redirect back to (the original /authorize request)
}

#[derive(Serialize, Debug)]
pub struct LoginResponse {
    success: bool,
    redirect_url: String,
}

// --- Token Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct TokenRequest {
    grant_type: String,
    code: Option<String>,
    #[allow(dead_code)]
    redirect_uri: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    client_id: String,
    client_secret: Option<String>,
    scope: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct TokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
    refresh_token: Option<String>,
    scope: String,
    id_token: Option<String>,
}

// --- Authorize Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct AuthorizeRequest {
    pub client_id: String,
    pub redirect_uri: String,
    pub response_type: String,
    pub scope: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    pub nonce: Option<String>,
}

// --- UserInfo Endpoint Structs ---

#[derive(Serialize, Debug)]
pub struct UserInfoResponse {
    sub: String,
    // Add other standard claims as needed
}

// --- Introspect Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct IntrospectRequest {
    token: String,
}

#[derive(Serialize, Debug)]
pub struct IntrospectResponse {
    active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sub: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exp: Option<usize>,
}

// --- Revoke Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct RevokeRequest {
    token: String,
    client_id: String,
    client_secret: Option<String>,
    #[serde(default)]
    token_type_hint: Option<String>,
}

// --- Authentication Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct AuthenticateRequest {
    username: String,
    password: String,
}

#[derive(Serialize, Debug)]
pub struct AuthenticateResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

// --- Endpoint Handlers ---

/// Handles POST `/api/v2/auth/login`
/// This is the new primary login endpoint for browser-based flows.
/// It authenticates a user via JSON submission, sets a session cookie, and returns the redirect URL.
pub async fn login_endpoint(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
    JsonExtractor(mut request): JsonExtractor<LoginRequest>,
) -> Result<(CookieJar, Json<LoginResponse>), AppError> {
    // 0. 前端验证: 验证用户名和密码格式
    // Validate username format (3-50 chars, alphanumeric + ._@-)
    let username = request.username.trim().to_string();
    if username.is_empty() || username.len() < 3 || username.len() > 50 {
        return Err(ServiceError::ValidationError(
            "用户名长度必须在 3-50 个字符之间".to_string(),
        ).into());
    }

    if !username.chars().all(|c| c.is_alphanumeric() || "._@-".contains(c)) {
        return Err(ServiceError::ValidationError(
            "用户名包含无效字符".to_string(),
        ).into());
    }

    // Validate password format (6-128 chars)
    if request.password.is_empty() || request.password.len() < 6 || request.password.len() > 128 {
        return Err(ServiceError::ValidationError(
            "密码长度必须在 6-128 个字符之间".to_string(),
        ).into());
    }

    // 更新 request 使用验证后的用户名
    request.username = username;

    // 0.5 解析重定向 URL（防止开放重定向）
    // Validate and parse redirect URL if provided
    let validated_redirect = if let Some(ref redirect) = request.redirect {
        let url = redirect.trim();
        if !url.is_empty() {
            // 允许的重定向源
            let allowed_origins = [
                "http://localhost:3002",
                "http://localhost:3001",
                "http://127.0.0.1:3002",
                "http://127.0.0.1:3001",
                "/",
            ];

            let is_valid = allowed_origins.iter().any(|origin| {
                url.starts_with(origin)
            }) || url.starts_with("/");

            if !is_valid {
                return Err(ServiceError::ValidationError(
                    "无效的重定向 URL".to_string(),
                ).into());
            }
            Some(url.to_string())
        } else {
            None
        }
    } else {
        None
    };

    // 用验证后的重定向替换原来的
    request.redirect = validated_redirect;

    // 1. 速率限制检查 - 5 次尝试每 5 分钟每 IP
    // Rate limiting check - 5 attempts per 5 minutes per IP
    // Extract client IP from headers (X-Forwarded-For or X-Real-IP) or connection
    let client_ip = extract_client_ip(&headers)?;

    // Check if login attempt is allowed
    if !state.login_rate_limiter.check_login_attempt(client_ip).await {
        let remaining = state.login_rate_limiter.get_remaining_attempts(client_ip).await;
        tracing::warn!(
            "Login rate limit exceeded for IP: {}, remaining attempts: {}",
            client_ip,
            remaining
        );
        return Err(ServiceError::RateLimitExceeded(
            "Too many login attempts. Please try again in 5 minutes.".to_string(),
        ).into());
    }

    // 1. Authenticate the user
    let user = state
        .user_service
        .authenticate(&request.username, &request.password)
        .await?;

    // 2. Issue a short-lived access token to be used as the session token
    let client = state.client_service.get_internal_client().await?;
    let permissions = state.rbac_service.get_user_permissions(&user.id).await?;
    let token_pair = state
        .token_service
        .issue_tokens(&client, Some(user.id), "session".to_string(), permissions, None)
        .await?;

    // 3. Set the session cookie with enhanced security attributes
    let is_production = std::env::var("NODE_ENV")
        .unwrap_or_else(|_| "development".to_string()) == "production";

    // 从环境变量读取 Cookie domain
    // 本地开发使用 .localhost，生产环境使用实际域名
    let cookie_domain = std::env::var("COOKIE_DOMAIN")
        .unwrap_or_else(|_| {
            if is_production {
                tracing::warn!("COOKIE_DOMAIN not set in production! Using default .localhost. This may fail!");
                ".localhost".to_string()
            } else {
                ".localhost".to_string()
            }
        });

    // 显式设置 domain 属性，确保 cookie 跨子域正确工作
    let session_cookie = Cookie::build(("session_token", token_pair.access_token))
        .domain(cookie_domain)     // ✅ 显式设置 domain，避免浏览器推断失败
        .path("/")
        .http_only(true)           // ✅ Prevent XSS attacks - JavaScript cannot access this cookie
        .secure(is_production)     // ✅ Enforce HTTPS in production
        .same_site(SameSite::Strict) // ✅ CSRF protection - Strict is more secure than Lax
        .max_age(time::Duration::hours(1)); // Session expires in 1 hour

    let updated_jar = jar.add(session_cookie);

    // 4. Return JSON response with redirect URL instead of 302 redirect
    // This ensures the Set-Cookie header is properly received by the browser

    // 解析原始的 /authorize URL 来提取 OAuth 参数
    // Parse the original /authorize URL to extract OAuth parameters
    let redirect_url = if let Some(auth_url) = &request.redirect {
        // 使用 url 库来解析 URL 和查询参数
        // Parse the authorize URL to extract query parameters
        if let Ok(parsed_url) = url::Url::parse(auth_url) {
            let params: std::collections::HashMap<String, String> = parsed_url
                .query_pairs()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();

            // 获取 Admin Portal URL，默认使用 localhost:6188（通过 Pingora 代理）
            // Get Admin Portal URL from environment or use default via Pingora proxy
            let admin_portal_url = std::env::var("ADMIN_PORTAL_URL")
                .unwrap_or_else(|_| "http://localhost:6188".to_string());

            // 构建指向 Admin Portal 同意页面的 URL
            // Construct URL to Admin Portal's consent page with OAuth parameters
            let mut query_parts = Vec::new();

            if let Some(client_id) = params.get("client_id") {
                query_parts.push(format!("client_id={}", urlencoding::encode(client_id)));
            }
            if let Some(redirect_uri) = params.get("redirect_uri") {
                query_parts.push(format!("redirect_uri={}", urlencoding::encode(redirect_uri)));
            }
            if let Some(response_type) = params.get("response_type") {
                query_parts.push(format!("response_type={}", urlencoding::encode(response_type)));
            } else {
                query_parts.push("response_type=code".to_string());
            }
            if let Some(scope) = params.get("scope") {
                query_parts.push(format!("scope={}", urlencoding::encode(scope)));
            }
            if let Some(state) = params.get("state") {
                query_parts.push(format!("state={}", urlencoding::encode(state)));
            }
            if let Some(code_challenge) = params.get("code_challenge") {
                query_parts.push(format!("code_challenge={}", urlencoding::encode(code_challenge)));
            }
            if let Some(code_challenge_method) = params.get("code_challenge_method") {
                query_parts.push(format!("code_challenge_method={}", urlencoding::encode(code_challenge_method)));
            } else {
                query_parts.push("code_challenge_method=S256".to_string());
            }
            if let Some(nonce) = params.get("nonce") {
                query_parts.push(format!("nonce={}", urlencoding::encode(nonce)));
            }

            let query_string = query_parts.join("&");
            format!("{}/oauth/consent?{}", admin_portal_url, query_string)
        } else {
            // 如果无法解析 URL，使用默认回退 (使用 Admin Portal URL)
            // If URL parsing fails, fall back to default
            let admin_portal_url = std::env::var("ADMIN_PORTAL_URL")
                .unwrap_or_else(|_| "http://localhost:6188".to_string());
            format!("{}/oauth/consent", admin_portal_url)
        }
    } else {
        // 如果没有提供 redirect URL，默认指向同意页面 (使用 Admin Portal URL)
        // If no redirect URL provided, default to consent page
        let admin_portal_url = std::env::var("ADMIN_PORTAL_URL")
            .unwrap_or_else(|_| "http://localhost:6188".to_string());
        format!("{}/oauth/consent", admin_portal_url)
    };

    tracing::info!(
        "Login successful for user: {}, redirecting to consent page: {}",
        request.username,
        redirect_url
    );

    Ok((updated_jar, Json(LoginResponse {
        success: true,
        redirect_url,
    })))
}


/// Handles `/api/v2/oauth/token`
pub async fn token_endpoint(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    JsonExtractor(request): JsonExtractor<TokenRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    // 0. Rate limiting check - 20 attempts per minute per IP
    let client_ip = extract_client_ip(&headers)?;

    if !state.token_rate_limiter.check_rate_limit(&client_ip.to_string()).await {
        tracing::warn!("Token endpoint rate limit exceeded for IP: {}", client_ip);
        return Err(ServiceError::RateLimitExceeded(
            "Too many token requests. Please try again later.".to_string(),
        ).into());
    }

    let client = state
        .client_service
        .authenticate_client(&request.client_id, request.client_secret.as_deref())
        .await?;

    match request.grant_type.as_str() {
        "authorization_code" => handle_authorization_code_grant(state, client, request).await,
        "refresh_token" => handle_refresh_token_grant(state, request).await,
        "client_credentials" => handle_client_credentials_grant(state, client, request).await,
        _ => Err(ServiceError::ValidationError("Unsupported grant type".to_string()).into()),
    }
}

/// Handles `/api/v2/oauth/authorize`
pub async fn authorize_endpoint(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Query(request): Query<AuthorizeRequest>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    // 1. Validate client_id, redirect_uri, response_type, and scopes
    validation::validate_client_id(&request.client_id)?;
    let client_details = state
        .client_service
        .find_by_client_id(&request.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Invalid client_id".to_string()))?;
    validation::validate_redirect_uri(&request.redirect_uri, &client_details.redirect_uris)?;
    validation::validate_response_type(&request.response_type)?;
    validation::validate_scope(&request.scope, &client_details.allowed_scopes)?;
    if !client_details.response_types.contains(&request.response_type) {
        return Err(ServiceError::ValidationError("Unsupported response_type".to_string()).into());
    }

    // 2. Extract authenticated user from session cookie or Authorization header
    let user_id = match extract_user_id_from_request(&state, &jar, &headers).await {
        Ok(id) => id,
        Err(_) => {
            // 用户未认证 - 重定向到登录页面
            //
            // ⚠️ 重要：OAuth 2.1 "UI 助手"模式的实现
            // 架构设计：
            // - OAuth Service (本服务) 是认证授权中心，控制完整的 OAuth 流程
            // - Admin Portal 是第三方客户端应用，同时作为 UI 助手
            // - 登录页面由 Admin Portal 提供 UI，但由 OAuth Service 控制流程
            //
            // 工作流程：
            // 1. 用户访问受保护的 Admin Portal 资源时发起 OAuth 授权 (/api/v2/oauth/authorize)
            // 2. 此端点检查用户是否有有效的 session_token (由 /api/v2/auth/login 设置)
            // 3. 如果用户未认证，本服务重定向到 Admin Portal 的 /login 页面
            // 4. Admin Portal /login 页面收集用户凭证（不验证）
            // 5. Admin Portal 将凭证转发到此服务的 /api/v2/auth/login
            // 6. 此服务验证凭证、设置 session_token、返回 redirect_url
            // 7. Admin Portal 重定向回原始的 /authorize 请求
            // 8. 此服务现在看到有效的 session_token，处理授权流程
            //
            // 安全考虑：
            // - Admin Portal URL 通过 NEXT_PUBLIC_ADMIN_PORTAL_URL 环境变量配置
            // - Admin Portal 的 /login 必须验证 redirect 参数（防止 open redirect 攻击）
            // - redirect 参数包含原始的 /authorize URL，保留所有 PKCE 参数
            // - 凭证仅在内存中暂存，不被持久化到 Admin Portal
            //
            let admin_portal_url = std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
                .unwrap_or_else(|_| "http://localhost:3002".to_string());

            // Build the return URL that will redirect back to authorize after login
            // This preserves all OAuth parameters including PKCE code_challenge
            let authorize_base = std::env::var("NEXT_PUBLIC_OAUTH_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string());
            let mut authorize_params = vec![
                ("client_id", request.client_id.as_str()),
                ("redirect_uri", request.redirect_uri.as_str()),
                ("response_type", request.response_type.as_str()),
                ("scope", request.scope.as_str()),
                ("code_challenge", request.code_challenge.as_str()),
                ("code_challenge_method", request.code_challenge_method.as_str()),
            ];
            if let Some(nonce) = &request.nonce {
                authorize_params.push(("nonce", nonce.as_str()));
            }
            let authorize_url = build_url(&authorize_base, "/api/v2/oauth/authorize", &authorize_params)?;

            // Redirect to Admin Portal's /login with the authorize URL as the return destination
            let login_url = build_url(&admin_portal_url, "/login", &[("redirect", authorize_url.as_str())])?;

            return Ok(Redirect::to(login_url.as_str()).into_response());
        }
    };

    // 3. 检查是否需要显示同意页面 (require_consent)
    //
    // OAuth 2.1 同意流程：
    // 如果客户端配置了 require_consent=true，用户需要明确同意授权
    // 此时重定向到 Admin Portal 的同意页面，由用户进行同意决定
    //
    // 同意流程：
    // 1. 重定向到 Admin Portal 的 /oauth/consent 页面
    // 2. Admin Portal 调用 GET /api/v2/oauth/consent/info 获取同意信息
    // 3. 显示同意对话框给用户
    // 4. 用户选择"允许"或"拒绝"
    // 5. Admin Portal 调用 POST /api/v2/oauth/consent/submit 提交决定
    // 6. 此端点生成授权码或返回 error=access_denied
    //
    // 安全考虑：
    // - ✅ 用户已认证（session_token 有效）
    // - ✅ 客户端已验证（client_id, redirect_uri 有效）
    // - ✅ scope 已验证（在客户端允许范围内）
    // - ✅ 同意决定由经过认证的用户明确做出
    if client_details.client.require_consent {
        tracing::info!(
            "Client {} requires consent, redirecting to consent page",
            request.client_id
        );

        let admin_portal_url = std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
            .unwrap_or_else(|_| "http://localhost:3002".to_string());

        // 构建同意页面 URL，携带所有 OAuth 参数
        let mut consent_params = vec![
            ("client_id", request.client_id.as_str()),
            ("redirect_uri", request.redirect_uri.as_str()),
            ("response_type", request.response_type.as_str()),
            ("scope", request.scope.as_str()),
            ("code_challenge", request.code_challenge.as_str()),
            ("code_challenge_method", request.code_challenge_method.as_str()),
        ];
        if let Some(nonce) = &request.nonce {
            consent_params.push(("nonce", nonce.as_str()));
        }
        let consent_url = build_url(&admin_portal_url, "/oauth/consent", &consent_params)?;

        return Ok(Redirect::to(consent_url.as_str()).into_response());
    }

    // 4. 创建授权码
    //
    // 只有在以下情况下才会到达这里：
    // 1. 用户已认证（有有效的 session_token）
    // 2. 客户端配置了 require_consent=false
    //    OR
    //    用户已经通过 /oauth/consent/submit 提交了"允许"决定，
    //    现在返回到此端点进行授权码生成
    //
    // 此时所有验证都已通过，可以安全地生成授权码
    tracing::info!(
        "Generating authorization code for client: {}, user: {}",
        request.client_id,
        user_id
    );
    let auth_code = state
        .auth_code_service
        .create_auth_code(&request, &user_id)
        .await?;

    // 4. Build redirect URL with authorization code
    let mut redirect_url = url::Url::parse(&request.redirect_uri)
        .map_err(|_| ServiceError::Internal("Failed to parse redirect_uri".to_string()))?;
    redirect_url.query_pairs_mut().append_pair("code", &auth_code);

    Ok(Redirect::to(redirect_url.as_str()).into_response())
}


/// Handles `/api/v2/oauth/userinfo`
pub async fn userinfo_endpoint(
    State(_state): State<Arc<AppState>>,
    axum::Extension(auth_context): axum::Extension<crate::middleware::auth::AuthContext>,
) -> Result<Json<UserInfoResponse>, AppError> {
    let user_id = auth_context
        .user_id
        .ok_or_else(|| ServiceError::Unauthorized("Token does not represent a user".to_string()))?;

    Ok(Json(UserInfoResponse { sub: user_id }))
}

/// Handles `/api/v2/oauth/introspect`
pub async fn introspect_endpoint(
    State(state): State<Arc<AppState>>,
    Form(request): Form<IntrospectRequest>,
) -> Result<Json<IntrospectResponse>, AppError> {
    match state.token_service.introspect_token(&request.token).await {
        Ok(claims) => Ok(Json(IntrospectResponse {
            active: true,
            scope: Some(claims.scope),
            client_id: Some(claims.client_id),
            username: claims.sub.clone(),
            sub: claims.sub,
            exp: Some(claims.exp),
        })),
        Err(_) => Ok(Json(IntrospectResponse {
            active: false,
            scope: None,
            client_id: None,
            username: None,
            sub: None,
            exp: None,
        })),
    }
}

/// Handles `/api/v2/oauth/revoke`
pub async fn revoke_endpoint(
    State(state): State<Arc<AppState>>,
    Form(request): Form<RevokeRequest>,
) -> Result<StatusCode, AppError> {
    // 1. Authenticate the client
    state
        .client_service
        .authenticate_client(&request.client_id, request.client_secret.as_deref())
        .await?;

    // 2. Validate token is not empty
    validation::validate_auth_code(&request.token)?;

    // 3. Revoke the token
    let token_type_hint = request.token_type_hint.as_deref();
    match state
        .token_service
        .revoke_token(&request.token, token_type_hint)
        .await
    {
        Ok(_) => {
            tracing::info!(
                "Token revoked successfully for client: {}",
                request.client_id
            );
            Ok(StatusCode::OK)
        }
        Err(e) => {
            tracing::debug!("Token revocation error (treating as success per RFC 7009): {:?}", e);
            Ok(StatusCode::OK)
        }
    }
}

/// DEPRECATED: Handles `/api/v2/auth/authenticate`
/// This endpoint should be phased out in favor of the standard /authorize and /login flow.
pub async fn authenticate_endpoint(
    State(state): State<Arc<AppState>>,
    Form(request): Form<AuthenticateRequest>,
) -> Result<Json<AuthenticateResponse>, AppError> {
    // ... (implementation remains for now for backward compatibility)
    let user = state
        .user_service
        .authenticate(&request.username, &request.password)
        .await?;
    let _ = state.user_service.update_last_login(&user.id).await;
    let permissions = state
        .rbac_service
        .get_user_permissions(&user.id)
        .await?;
    let client = state
        .client_service
        .find_by_client_id("admin-portal-client")
        .await?
        .ok_or_else(|| {
            AppError::Service(ServiceError::NotFound(
                "Admin portal client not configured".to_string(),
            ))
        })?;
    let token_pair = state
        .token_service
        .issue_tokens(
            &client,
            Some(user.id.clone()),
            "admin".to_string(),
            permissions,
            None,
        )
        .await?;

    Ok(Json(AuthenticateResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: token_pair.refresh_token,
    }))
}

// --- Grant Type Handlers ---

async fn handle_authorization_code_grant(
    state: Arc<AppState>,
    client: OAuthClientDetails,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    let code = request
        .code
        .ok_or_else(|| ServiceError::ValidationError("Missing authorization code".to_string()))?;
    let code_verifier = request
        .code_verifier
        .ok_or_else(|| ServiceError::ValidationError("Missing code_verifier".to_string()))?;

    // 1. Consume the authorization code
    let auth_code = state.auth_code_service.find_and_consume_code(&code).await?;

    // 2. Verify PKCE challenge
    let code_challenge = auth_code.code_challenge.as_deref().ok_or_else(|| {
        ServiceError::ValidationError("Missing code_challenge from authorization code".to_string())
    })?;
    pkce::verify_pkce(&code_verifier, code_challenge)?;

    // 3. Verify that the client making the token request is the same one that initiated the flow
    if auth_code.client_id != client.client.id {
        return Err(ServiceError::Unauthorized(
            "Client mismatch between authorization and token requests".to_string(),
        )
        .into());
    }

    // 4. Get user permissions and issue tokens
    let permissions = state
        .rbac_service
        .get_user_permissions(&auth_code.user_id)
        .await?;
    let token_pair = state
        .token_service
        .issue_tokens(
            &client,
            Some(auth_code.user_id),
            auth_code.scope,
            permissions,
            auth_code.nonce,
        )
        .await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: token_pair.refresh_token,
        scope: request.scope.unwrap_or_default(),
        id_token: token_pair.id_token,
    }))
}

async fn handle_refresh_token_grant(
    state: Arc<AppState>,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    let refresh_token = request
        .refresh_token
        .ok_or_else(|| ServiceError::ValidationError("Missing refresh_token".to_string()))?;

    let token_pair = state.token_service.refresh_token(&refresh_token).await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: token_pair.refresh_token,
        scope: request.scope.unwrap_or_default(),
        id_token: token_pair.id_token,
    }))
}

async fn handle_client_credentials_grant(
    state: Arc<AppState>,
    client: OAuthClientDetails,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    // For client credentials, permissions are derived from the client's own configuration
    let permissions = client.client_permissions.clone();
    let scope = request.scope.unwrap_or_default();

    // Validate that the requested scope is a subset of the client's allowed scopes
    validation::validate_scope(&scope, &client.allowed_scopes)?;

    let token_pair = state
        .token_service
        .issue_tokens(&client, None, scope.clone(), permissions, None)
        .await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: None, // No refresh token for client credentials
        scope,
        id_token: None,
    }))
}

// --- Helper Functions ---

/// Extracts user_id from session cookie (priority) or Authorization header.
pub async fn extract_user_id_from_request(
    state: &Arc<AppState>,
    jar: &CookieJar,
    headers: &axum::http::HeaderMap,
) -> Result<String, AppError> {
    // Log all cookies for debugging
    tracing::debug!("Cookies received in authorize request:");
    for cookie in jar.iter() {
        tracing::debug!("  Cookie: {} = {}", cookie.name(), cookie.value());
    }

    // 1. Try to authenticate via session cookie
    if let Some(cookie) = jar.get("session_token") {
        tracing::info!("Found session_token cookie, verifying...");
        match state.token_service.introspect_token(cookie.value()).await {
            Ok(claims) => {
                if let Some(user_id) = claims.sub {
                    tracing::info!("Session token validated successfully for user: {}", user_id);
                    return Ok(user_id);
                } else {
                    tracing::warn!("Session token has no sub claim");
                }
            }
            Err(e) => {
                tracing::warn!("Failed to validate session token: {:?}", e);
            }
        }
    } else {
        tracing::warn!("No session_token cookie found in request");
    }

    // 2. Fallback to Authorization header
    use axum::http::header;
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(AppError::Auth(crate::error::AuthError::InvalidToken))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::Auth(crate::error::AuthError::InvalidToken))?;

    let claims = state.token_service.introspect_token(token).await?;
    claims.sub.ok_or_else(|| {
        ServiceError::Unauthorized("Token does not represent a user".to_string()).into()
    })
}

// --- IP Extraction Helper ---

/// Safely extracts client IP from headers, falling back to default IP if extraction fails.
/// Returns an AppError if IP parsing fails and no default can be used.
fn extract_client_ip(headers: &axum::http::HeaderMap) -> Result<std::net::IpAddr, AppError> {
    // Try to extract from X-Forwarded-For header
    if let Some(forwarded_for) = headers.get("x-forwarded-for") {
        if let Ok(header_value) = forwarded_for.to_str() {
            if let Some(first_ip) = header_value.split(',').next() {
                if let Ok(ip) = first_ip.trim().parse::<std::net::IpAddr>() {
                    tracing::debug!("Extracted IP from X-Forwarded-For: {}", ip);
                    return Ok(ip);
                }
            }
        }
    }

    // Try to extract from X-Real-IP header
    if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(header_value) = real_ip.to_str() {
            if let Ok(ip) = header_value.parse::<std::net::IpAddr>() {
                tracing::debug!("Extracted IP from X-Real-IP: {}", ip);
                return Ok(ip);
            }
        }
    }

    // Fall back to default IP with logging
    tracing::warn!("Failed to extract client IP from headers, using default IP");
    Ok(DEFAULT_IP)
}

// --- URL Builder Helper ---

/// Builds a URL and appends query parameters, returning an AppError on failure.
fn build_url(base: &str, path: &str, params: &[(&str, &str)]) -> Result<url::Url, AppError> {
    let mut url = url::Url::parse(base)?;
    url.set_path(path);
    url.query_pairs_mut().extend_pairs(params);
    Ok(url)
}
