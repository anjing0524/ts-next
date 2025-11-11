use crate::error::{AppError, AuthError};
use crate::state::AppState;
use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

/// Represents the authenticated context that can be extracted from a request.
#[derive(Clone, Debug)]
pub struct AuthContext {
    pub client_id: String,
    pub user_id: Option<String>,
    pub permissions: Vec<String>,
}

/// Authentication middleware to validate Bearer tokens and set AuthContext.
///
/// # Design Note: Permission Checking Strategy
///
/// Permission checking is intentionally implemented at the middleware level
/// (see `middleware::permission::permission_middleware`) rather than in individual
/// route handlers. This achieves:
///
/// 1. **Separation of Concerns**: Permission logic is centralized and decoupled from business logic
/// 2. **DRY Principle**: Avoids duplicating permission checks across route handlers
/// 3. **Performance**: Single permission check per request, cached permissions via `PermissionCache`
/// 4. **Security**: Fail-safe - if a route doesn't have a permission mapping, it denies access by default
/// 5. **Maintainability**: Route handlers don't need to concern themselves with permissions
///
/// The flow is:
/// 1. `rate_limit_middleware` - early exit for rate-limited clients
/// 2. `auth_middleware` (this) - extract and validate token, populate AuthContext
/// 3. `permission_middleware` - check AuthContext.permissions against route requirements
/// 4. Route handler - business logic (permissions already validated)
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    // List of public paths that don't require authentication
    let public_paths = [
        "/health",
        "/api/v2/oauth/token",
        "/api/v2/oauth/authorize",
        "/api/v2/oauth/introspect",
        "/api/v2/oauth/revoke",
        "/api/v2/auth/authenticate",
        "/api/v2/auth/login",  // OAuth 2.1 login endpoint - must be public for unauthenticated users
    ];

    let path = request.uri().path();

    // Skip authentication for public paths
    if public_paths.contains(&path) {
        return Ok(next.run(request).await);
    }

    // Extract Bearer token from Authorization header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(AuthError::InvalidToken)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::InvalidToken)?;

    // Introspect the token to get claims
    let claims = state.token_service.introspect_token(token).await?;

    // Create AuthContext and insert into request extensions
    let auth_context = AuthContext {
        client_id: claims.client_id,
        user_id: claims.sub,
        permissions: claims.permissions,
    };
    request.extensions_mut().insert(auth_context);

    // TODO: Implement permission checking based on required permissions for the route

    Ok(next.run(request).await)
}
