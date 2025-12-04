use crate::middleware::auth::AuthContext;
use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;

/// Sanitizes query parameters to remove sensitive data for logging
/// Masks tokens, passwords, secrets, and other sensitive information
fn sanitize_query(query: Option<&str>) -> String {
    match query {
        None => "None".to_string(),
        Some(q) => {
            // List of sensitive parameter names to mask
            let sensitive_keys = [
                "password",
                "passwd",
                "pwd",
                "token",
                "access_token",
                "refresh_token",
                "id_token",
                "secret",
                "client_secret",
                "api_key",
                "api_secret",
                "auth",
                "authorization",
                "code",
                "code_verifier",
                "code_challenge",
            ];

            let mut result = String::new();
            let params: Vec<&str> = q.split('&').collect();

            for (i, param) in params.iter().enumerate() {
                if i > 0 {
                    result.push('&');
                }

                if let Some(eq_pos) = param.find('=') {
                    let param_name = &param[..eq_pos];
                    let param_value = &param[eq_pos + 1..];

                    result.push_str(param_name);
                    result.push('=');

                    if sensitive_keys
                        .iter()
                        .any(|k| k.eq_ignore_ascii_case(param_name))
                    {
                        result.push_str("***REDACTED***");
                    } else {
                        result.push_str(param_value);
                    }
                } else {
                    result.push_str(param);
                }
            }
            result
        }
    }
}

/// Sanitizes authorization header for logging
fn sanitize_auth_header(auth: Option<&str>) -> String {
    match auth {
        None => "None".to_string(),
        Some(auth_header) => {
            // Only show the first part (Bearer, Basic, etc.) and redact the rest
            if let Some(space_pos) = auth_header.find(' ') {
                if space_pos > 0 {
                    let prefix = &auth_header[..space_pos];
                    format!("{prefix} ...***REDACTED***")
                } else {
                    "***REDACTED***".to_string()
                }
            } else {
                "***REDACTED***".to_string()
            }
        }
    }
}

/// Audit middleware - logs all HTTP requests and responses
///
/// Features:
/// - Records request method, path, and query parameters
/// - Records user identity information
/// - Records response status code and processing time
/// - Uses structured logging for audit information
/// - Adjusts log level based on status code (ERROR/WARN/INFO)
pub async fn audit_middleware(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let start = Instant::now();

    // Extract authentication context
    let auth_context = request.extensions().get::<AuthContext>().cloned();

    let user_id = auth_context
        .as_ref()
        .and_then(|ctx| ctx.user_id.clone())
        .unwrap_or_else(|| "anonymous".to_string());

    let client_id = auth_context
        .as_ref()
        .map(|ctx| ctx.client_id.clone())
        .unwrap_or_else(|| "unknown".to_string());

    // Extract and sanitize auth header for logging
    let sanitized_auth = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    // Log request start with sanitized sensitive data
    tracing::info!(
        event = "request.start",
        method = %method,
        path = %uri.path(),
        query = %sanitize_query(uri.query()),
        user_id = %user_id,
        client_id = %client_id,
        authorization = %sanitize_auth_header(sanitized_auth),
        remote_addr = ?request.headers().get("x-forwarded-for"),
        user_agent = ?request.headers().get("user-agent").and_then(|v| v.to_str().ok()),
        "Incoming HTTP request"
    );

    // Process request
    let response = next.run(request).await;

    // Calculate processing time
    let duration = start.elapsed();
    let status = response.status().as_u16();

    // Log request completion with appropriate level based on status code
    match status {
        200..=299 => {
            tracing::info!(
                event = "request.complete",
                method = %method,
                path = %uri.path(),
                status = status,
                duration_ms = duration.as_millis() as u64,
                duration_us = duration.as_micros() as u64,
                user_id = %user_id,
                client_id = %client_id,
                "HTTP request completed"
            );
        }
        300..=399 => {
            tracing::info!(
                event = "request.complete",
                method = %method,
                path = %uri.path(),
                status = status,
                duration_ms = duration.as_millis() as u64,
                duration_us = duration.as_micros() as u64,
                user_id = %user_id,
                client_id = %client_id,
                "HTTP request completed"
            );
        }
        400..=499 => {
            tracing::warn!(
                event = "request.complete",
                method = %method,
                path = %uri.path(),
                status = status,
                duration_ms = duration.as_millis() as u64,
                duration_us = duration.as_micros() as u64,
                user_id = %user_id,
                client_id = %client_id,
                "HTTP request completed"
            );
        }
        500..=599 => {
            tracing::error!(
                event = "request.complete",
                method = %method,
                path = %uri.path(),
                status = status,
                duration_ms = duration.as_millis() as u64,
                duration_us = duration.as_micros() as u64,
                user_id = %user_id,
                client_id = %client_id,
                "HTTP request completed"
            );
        }
        _ => {
            tracing::info!(
                event = "request.complete",
                method = %method,
                path = %uri.path(),
                status = status,
                duration_ms = duration.as_millis() as u64,
                duration_us = duration.as_micros() as u64,
                user_id = %user_id,
                client_id = %client_id,
                "HTTP request completed"
            );
        }
    }

    // Log specific error cases
    match status {
        500..=599 => {
            tracing::error!(
                event = "error",
                status = status,
                path = %uri.path(),
                user_id = %user_id,
                "Server error occurred"
            );
        }
        401 => {
            tracing::warn!(
                event = "unauthorized",
                path = %uri.path(),
                "Unauthorized access attempt"
            );
        }
        403 => {
            tracing::warn!(
                event = "forbidden",
                path = %uri.path(),
                user_id = %user_id,
                "Forbidden access attempt"
            );
        }
        404 => {
            tracing::debug!(
                event = "not_found",
                path = %uri.path(),
                "Resource not found"
            );
        }
        _ => {}
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_middleware_exists() {
        // Verify middleware function exists with correct signature
        let _audit_fn = audit_middleware;
    }

    #[test]
    fn test_sanitize_auth_header() {
        assert_eq!(sanitize_auth_header(None), "None");
        assert_eq!(
            sanitize_auth_header(Some("Bearer token123")),
            "Bearer ...***REDACTED***"
        );
        assert_eq!(
            sanitize_auth_header(Some("Basic secret")),
            "Basic ...***REDACTED***"
        );
        assert_eq!(sanitize_auth_header(Some("noprefix")), "***REDACTED***");
    }

    #[test]
    fn test_sanitize_query_no_sensitive_data() {
        let result = sanitize_query(Some("page=1&limit=10"));
        assert!(result.contains("page=1"));
        assert!(result.contains("limit=10"));
    }

    #[test]
    fn test_sanitize_query_with_sensitive_data() {
        let result = sanitize_query(Some("code=abc123&client_id=test&password=secret123"));
        assert!(result.contains("code=***REDACTED***"));
        assert!(result.contains("client_id=test"));
        assert!(result.contains("password=***REDACTED***"));
    }

    #[test]
    fn test_sanitize_query_with_token() {
        let result = sanitize_query(Some("access_token=xyz789&refresh_token=qwe456&user=john"));
        assert!(result.contains("access_token=***REDACTED***"));
        assert!(result.contains("refresh_token=***REDACTED***"));
        assert!(result.contains("user=john"));
    }

    #[test]
    fn test_sanitize_query_with_api_secret() {
        let result = sanitize_query(Some("api_key=key123&api_secret=secret456&action=list"));
        assert!(result.contains("api_key=***REDACTED***"));
        assert!(result.contains("api_secret=***REDACTED***"));
        assert!(result.contains("action=list"));
    }

    #[test]
    fn test_sanitize_query_none() {
        assert_eq!(sanitize_query(None), "None");
    }
}
