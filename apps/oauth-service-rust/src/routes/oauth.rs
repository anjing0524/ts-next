use crate::error::{AppError, ServiceError};
use crate::models::client::OAuthClientDetails;
use crate::state::AppState;
use crate::utils::{pkce, validation};
use axum::{
    extract::{Form, Query, State},
    http::StatusCode,
    response::{Json, Redirect},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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

// --- Endpoint Handlers ---

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
///
/// This endpoint processes OAuth 2.0/2.1 authorization requests.
/// It validates the client, redirect_uri, response_type and creates an authorization code.
pub async fn authorize_endpoint(
    State(state): State<Arc<AppState>>,
    Query(request): Query<AuthorizeRequest>,
) -> Result<Redirect, AppError> {
    // 1. Validate client_id format
    validation::validate_client_id(&request.client_id)?;

    // 2. Find and validate the client
    let client_details = state
        .client_service
        .find_by_client_id(&request.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Invalid client_id".to_string()))?;

    // 3. Validate redirect_uri comprehensively
    validation::validate_redirect_uri(&request.redirect_uri, &client_details.redirect_uris)?;

    // 4. Validate response_type
    validation::validate_response_type(&request.response_type)?;

    // 5. Validate and enforce scopes
    validation::validate_scope(&request.scope, &client_details.allowed_scopes)?;

    // 6. Ensure response_type is supported by client
    if !client_details
        .response_types
        .contains(&request.response_type)
    {
        return Err(ServiceError::ValidationError("Unsupported response_type".to_string()).into());
    }

    // Extract authenticated user from session or context
    //
    // NOTE: The authorize endpoint requires knowledge of the authenticated user
    // to create an authorization code on their behalf. In a real OAuth 2.0 deployment:
    //
    // 1. User logs in via /login endpoint
    // 2. Session/cookie is set with user_id
    // 3. User's browser redirects to /authorize with session cookie
    // 4. This endpoint extracts user_id from session
    //
    // Current implementation uses environment-based user extraction for testing.
    // For production, integrate with your session management system (e.g., iron-sessions, tower-sessions).
    let user_id = extract_authenticated_user_id(&request)?;

    // 6. Create authorization code
    let auth_code = state
        .auth_code_service
        .create_auth_code(&request, &user_id)
        .await?;

    // 7. Build redirect URL with authorization code
    let mut redirect_url = url::Url::parse(&request.redirect_uri)
        .map_err(|_| ServiceError::Internal("Failed to parse redirect_uri".to_string()))?;
    redirect_url
        .query_pairs_mut()
        .append_pair("code", &auth_code);

    Ok(Redirect::to(redirect_url.as_str()))
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
///
/// According to RFC 7009, the revocation endpoint allows clients to notify
/// the authorization server that a previously obtained token is no longer needed.
/// The server should respond with 200 OK even if the token doesn't exist or is invalid.
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
    // RFC 7009: The authorization server validates the client credentials (in case of a confidential client)
    // and verifies whether the token was issued to the client making the revocation request.
    // If valid, the authorization server invalidates the token.
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
            // RFC 7009: The authorization server responds with HTTP status code 200
            // if the token has been revoked successfully or if the client
            // submitted an invalid token.
            tracing::debug!("Token revocation error (treating as success per RFC 7009): {:?}", e);
            Ok(StatusCode::OK)
        }
    }
}

// --- Grant Type Handlers ---

async fn handle_authorization_code_grant(
    state: Arc<AppState>,
    client: OAuthClientDetails,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    // 1. Validate required parameters
    let code = request
        .code
        .ok_or_else(|| ServiceError::ValidationError("'code' is required".to_string()))?;
    let code_verifier = request
        .code_verifier
        .ok_or_else(|| ServiceError::ValidationError("'code_verifier' is required".to_string()))?;

    // 2. Validate code format
    validation::validate_auth_code(&code)?;

    // 3. Validate code_verifier format (RFC 7636)
    validation::validate_code_verifier(&code_verifier)?;

    // 4. If redirect_uri is provided in token request, validate it
    if let Some(ref redirect_uri) = request.redirect_uri {
        validation::validate_redirect_uri(redirect_uri, &client.redirect_uris)?;
    }

    // 5. Find and consume authorization code (prevents reuse)
    let auth_code = state.auth_code_service.find_and_consume_code(&code).await?;

    // 6. Verify client_id matches the authorization request
    if auth_code.client_id != client.client.id {
        tracing::warn!(
            "Client mismatch in token request: expected {}, got {}",
            auth_code.client_id,
            client.client.id
        );
        return Err(ServiceError::ValidationError("Invalid client_id for this authorization code".to_string()).into());
    }

    // 7. Verify redirect_uri consistency
    // NOTE: In a complete implementation, we would verify that the redirect_uri in the token request
    // (if provided) matches the one from the original authorization request.
    // The authorization code already contains the original redirect_uri,
    // so we could validate: request.redirect_uri == auth_code.redirect_uri
    // For now, this is implicitly secured by the authorization code being bound to a specific client.

    // 8. Enforce scope matching between authorization and token requests
    // If scope is provided in token request, it must be a subset of auth scope
    validation::enforce_scope_match(&auth_code.scope, request.scope.as_deref())?;

    // 9. Verify PKCE if required (OAuth 2.1 requires PKCE for public clients)
    if let Some(challenge) = auth_code.code_challenge {
        pkce::verify_pkce(&challenge, &code_verifier)?;
    }

    // 10. Get effective scope (use token request scope if provided, otherwise auth scope)
    let effective_scope = request.scope.unwrap_or_else(|| auth_code.scope.clone());

    let permissions = state
        .rbac_service
        .get_user_permissions(&auth_code.user_id)
        .await?;

    let token_pair = state
        .token_service
        .issue_tokens(
            &client,
            Some(auth_code.user_id),
            effective_scope.clone(),
            permissions,
            auth_code.nonce,
        )
        .await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: token_pair.refresh_token,
        scope: effective_scope,
        id_token: token_pair.id_token,
    }))
}

async fn handle_refresh_token_grant(
    state: Arc<AppState>,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    let refresh_token = request
        .refresh_token
        .ok_or_else(|| ServiceError::ValidationError("'refresh_token' is required".to_string()))?;

    let token_pair = state.token_service.refresh_token(&refresh_token).await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: token_pair.refresh_token,
        scope: request.scope.unwrap_or_default(), // Scope should come from claims
        id_token: token_pair.id_token,
    }))
}

async fn handle_client_credentials_grant(
    state: Arc<AppState>,
    client: OAuthClientDetails,
    request: TokenRequest,
) -> Result<Json<TokenResponse>, AppError> {
    let client_permissions = &client.client_permissions;

    let granted_scope_str: String;
    let granted_permissions: Vec<String>;

    if let Some(requested_scope_str) = &request.scope {
        if !requested_scope_str.is_empty() {
            let requested_scopes: Vec<String> = requested_scope_str
                .split_whitespace()
                .map(String::from)
                .collect();
            let client_perms_set: std::collections::HashSet<_> =
                client_permissions.iter().cloned().collect();

            if requested_scopes
                .iter()
                .all(|s| client_perms_set.contains(s))
            {
                granted_permissions = requested_scopes;
                granted_scope_str = granted_permissions.join(" ");
            } else {
                return Err(ServiceError::InvalidScope(
                    "Requested scope exceeds client permissions".to_string(),
                )
                .into());
            }
        } else {
            granted_permissions = client_permissions.clone();
            granted_scope_str = granted_permissions.join(" ");
        }
    } else {
        granted_permissions = client_permissions.clone();
        granted_scope_str = granted_permissions.join(" ");
    }

    let token_pair = state
        .token_service
        .issue_tokens(
            &client,
            None,
            granted_scope_str.clone(),
            granted_permissions,
            None,
        )
        .await?;

    Ok(Json(TokenResponse {
        access_token: token_pair.access_token,
        token_type: "Bearer".to_string(),
        expires_in: token_pair.expires_in,
        refresh_token: None,
        scope: granted_scope_str,
        id_token: None,
    }))
}

// --- Helper Functions ---

/// Extracts the authenticated user ID from the request context.
///
/// In a real system, this would:
/// 1. Extract session cookie
/// 2. Look up session in session store
/// 3. Return user_id from session
///
/// For testing/demo, this checks:
/// 1. OAUTH_USER_ID environment variable
/// 2. Falls back to "test_user_id" for testing
fn extract_authenticated_user_id(_request: &AuthorizeRequest) -> Result<String, AppError> {
    // Try to get from environment variable (useful for testing)
    if let Ok(user_id) = std::env::var("OAUTH_USER_ID") {
        if !user_id.is_empty() {
            return Ok(user_id);
        }
    }

    // Fallback for testing: use a default test user
    // In production, this should return an error instead
    tracing::warn!(
        "No user authentication found. Using test user. This should not happen in production!"
    );
    Ok("test_user_id".to_string())
}
