use crate::error::{AppError, ServiceError};
use crate::models::client::OAuthClientDetails;
use crate::state::AppState;
use crate::utils::{pkce, validation};
use axum::{
    extract::{Form, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Redirect},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time;

// --- Login Endpoint Structs ---

#[derive(Deserialize, Debug)]
pub struct LoginRequest {
    username: String,
    password: String,
    redirect: Option<String>, // The URL to redirect back to (the original /authorize request)
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
/// It authenticates a user via form submission, sets a session cookie, and redirects back to the /authorize flow.
pub async fn login_endpoint(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Form(request): Form<LoginRequest>,
) -> Result<(CookieJar, Redirect), AppError> {
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

    // 3. Set the session cookie
    let session_cookie = Cookie::build(("session_token", token_pair.access_token))
        .path("/")
        .domain("localhost") // 设置为 localhost 以支持同域共享
        .http_only(true)
        .secure(false) // 开发环境使用 HTTP，生产环境应设为 true
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(1));
    
    let updated_jar = jar.add(session_cookie);

    // 4. Redirect back to the original /authorize URL
    let redirect_url = request.redirect.unwrap_or_else(|| "/".to_string());
    
    Ok((updated_jar, Redirect::to(&redirect_url)))
}


/// Handles `/api/v2/oauth/token`
pub async fn token_endpoint(
    State(state): State<Arc<AppState>>,
    Form(request): Form<TokenRequest>,
) -> Result<Json<TokenResponse>, AppError> {
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
            // User not authenticated - redirect to admin-portal login page
            let admin_portal_url = std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
                .unwrap_or_else(|_| "http://localhost:3002".to_string());

            // Build the return URL that will redirect back to authorize after login
            let mut authorize_url = url::Url::parse(&format!(
                "{}/api/v2/oauth/authorize",
                std::env::var("NEXT_PUBLIC_OAUTH_SERVICE_URL")
                    .unwrap_or_else(|_| "http://localhost:3001".to_string())
            )).expect("Failed to parse authorize URL");

            authorize_url.query_pairs_mut()
                .append_pair("client_id", &request.client_id)
                .append_pair("redirect_uri", &request.redirect_uri)
                .append_pair("response_type", &request.response_type)
                .append_pair("scope", &request.scope)
                .append_pair("code_challenge", &request.code_challenge)
                .append_pair("code_challenge_method", &request.code_challenge_method);
            if let Some(nonce) = &request.nonce {
                authorize_url.query_pairs_mut().append_pair("nonce", nonce);
            }

            let mut login_url = url::Url::parse(&format!("{}/login", admin_portal_url))
                .expect("Failed to parse login URL");
            login_url.query_pairs_mut().append_pair("redirect", authorize_url.as_str());

            return Ok(Redirect::to(login_url.as_str()).into_response());
        }
    };

    // TODO: Implement consent screen logic here.
    // For now, we assume consent is implicitly given.

    // 3. Create authorization code
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
async fn extract_user_id_from_request(
    state: &Arc<AppState>,
    jar: &CookieJar,
    headers: &axum::http::HeaderMap,
) -> Result<String, AppError> {
    // 1. Try to authenticate via session cookie
    if let Some(cookie) = jar.get("session_token") {
        if let Ok(claims) = state.token_service.introspect_token(cookie.value()).await {
            if let Some(user_id) = claims.sub {
                return Ok(user_id);
            }
        }
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
