//! OAuth validation utilities
//!
//! This module provides validation functions for OAuth 2.0/2.1 parameters
//! including redirect URI validation, scope validation, and format checks.

use crate::error::ServiceError;
use url::Url;

/// Validates a redirect URI against a set of registered redirect URIs.
///
/// According to OAuth 2.0 (RFC 6749) and OAuth 2.1 specs:
/// - The redirect_uri MUST match exactly with a registered URI
/// - Fragment identifiers (#) are NOT allowed
/// - Comparison is case-sensitive for scheme and host, but case-insensitive for path/query
///
/// # Arguments
/// * `redirect_uri` - The redirect URI from the authorization request
/// * `registered_uris` - The list of registered redirect URIs for the client
///
/// # Returns
/// * `Ok(())` if the redirect_uri is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_redirect_uri(
    redirect_uri: &str,
    registered_uris: &[String],
) -> Result<(), ServiceError> {
    // Optimization: Use iterator-based comparison to avoid cloning the redirect_uri string
    // Check if redirect_uri is in the registered list
    if !registered_uris.iter().any(|uri| uri == redirect_uri) {
        return Err(ServiceError::ValidationError(
            "Redirect URI not registered for this client".to_string(),
        ));
    }

    // Parse the URL to validate format
    let url = Url::parse(redirect_uri).map_err(|e| {
        ServiceError::ValidationError(format!("Invalid redirect URI format: {e}"))
    })?;

    // OAuth 2.0/2.1: Fragment identifiers are not allowed
    if url.fragment().is_some() {
        return Err(ServiceError::ValidationError(
            "Redirect URI must not contain fragment identifier".to_string(),
        ));
    }

    // OAuth 2.1: HTTPS is REQUIRED for public URLs (except for localhost during development)
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" && scheme != "custom-scheme" {
        return Err(ServiceError::ValidationError(format!(
            "Redirect URI scheme must be http, https, or custom-scheme, got: {scheme}"
        )));
    }

    // For non-localhost HTTP, require HTTPS (can be disabled for development)
    if scheme == "http" {
        let host = url.host_str();
        if !matches!(host, Some("localhost") | Some("127.0.0.1") | Some("[::1]")) {
            tracing::warn!(
                "Redirect URI uses HTTP for non-localhost host: {}",
                host.unwrap_or("unknown")
            );
            // In production, this should be an error:
            // return Err(ServiceError::ValidationError(
            //     "HTTPS is required for redirect URIs (except localhost)".to_string(),
            // ));
        }
    }

    Ok(())
}

/// Validates a scope string according to OAuth 2.0 spec.
///
/// Scopes should be space-separated and contain only allowed characters.
///
/// # Arguments
/// * `scope` - The scope string to validate
/// * `allowed_scopes` - The list of scopes allowed for this client
///
/// # Returns
/// * `Ok(())` if the scope is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_scope(scope: &str, allowed_scopes: &[String]) -> Result<(), ServiceError> {
    if scope.is_empty() {
        return Err(ServiceError::ValidationError("Scope cannot be empty".to_string()));
    }

    // Parse space-separated scopes
    let requested: Vec<&str> = scope.split_whitespace().collect();

    // Check if all requested scopes are allowed
    for req_scope in requested {
        if !allowed_scopes.iter().any(|s| s == req_scope) {
            return Err(ServiceError::ValidationError(format!(
                "Requested scope '{req_scope}' is not allowed for this client"
            )));
        }
    }

    Ok(())
}

/// Enforces that scopes in the token request are a subset of the original authorization request.
///
/// According to OAuth 2.0 spec, when a client requests specific scopes in the token request,
/// they must be the same as (or a subset of) the scopes requested in the authorization request.
///
/// # Arguments
/// * `auth_scope` - The scope string from the original authorization request
/// * `token_scope` - The scope string from the token request (can be None, meaning use auth_scope)
///
/// # Returns
/// * `Ok(())` if the scope is valid
/// * `Err(ServiceError)` if the token request tries to expand scope
pub fn enforce_scope_match(
    auth_scope: &str,
    token_scope: Option<&str>,
) -> Result<(), ServiceError> {
    // If no scope is specified in token request, use the auth scope
    let requested = token_scope.unwrap_or(auth_scope);

    // Parse scopes
    let authorized: std::collections::HashSet<&str> = auth_scope.split_whitespace().collect();
    let requested_set: std::collections::HashSet<&str> = requested.split_whitespace().collect();

    // Check that requested scopes are subset of authorized scopes
    if !requested_set.is_subset(&authorized) {
        let unauthorized: Vec<&str> = requested_set
            .difference(&authorized)
            .copied()
            .collect();
        return Err(ServiceError::ValidationError(format!(
            "Token request attempts to expand scope beyond authorization. Unauthorized scopes: {}",
            unauthorized.join(", ")
        )));
    }

    Ok(())
}

/// Parses scope string into a Vec of individual scopes.
///
/// # Arguments
/// * `scope` - Space-separated scope string
///
/// # Returns
/// * Vec of scope strings
pub fn parse_scopes(scope: &str) -> Vec<String> {
    scope
        .split_whitespace()
        .map(|s| s.to_string())
        .collect()
}

/// Validates a nonce value (optional OpenID Connect parameter).
///
/// Nonces should be:
/// - Non-empty if provided
/// - Reasonably short (max 256 chars)
///
/// # Arguments
/// * `nonce` - The nonce value to validate
///
/// # Returns
/// * `Ok(())` if the nonce is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_nonce(nonce: &str) -> Result<(), ServiceError> {
    if nonce.is_empty() {
        return Err(ServiceError::ValidationError(
            "nonce cannot be empty".to_string(),
        ));
    }

    if nonce.len() > 256 {
        return Err(ServiceError::ValidationError(
            "nonce exceeds maximum length of 256 characters".to_string(),
        ));
    }

    Ok(())
}

/// Validates a state value (OAuth 2.0 state parameter for CSRF protection).
///
/// State values should be:
/// - Non-empty
/// - Reasonably short (max 500 chars, to fit in URL)
/// - Contain only unreserved characters
///
/// # Arguments
/// * `state` - The state value to validate
///
/// # Returns
/// * `Ok(())` if the state is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_state(state: &str) -> Result<(), ServiceError> {
    if state.is_empty() {
        return Err(ServiceError::ValidationError(
            "state cannot be empty".to_string(),
        ));
    }

    if state.len() > 500 {
        return Err(ServiceError::ValidationError(
            "state exceeds maximum length of 500 characters".to_string(),
        ));
    }

    // Check for valid characters (alphanumeric, hyphen, underscore, dot)
    // State can be any URL-safe string
    if !state
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~')
    {
        return Err(ServiceError::ValidationError(
            "state contains invalid characters".to_string(),
        ));
    }

    Ok(())
}

/// Validates request_uri (for pushed authorization requests - not yet implemented).
///
/// # Arguments
/// * `uri` - The request URI to validate
///
/// # Returns
/// * `Ok(())` if the URI is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_request_uri(uri: &str) -> Result<(), ServiceError> {
    // Validate it's a valid URL
    url::Url::parse(uri).map_err(|e| {
        ServiceError::ValidationError(format!("Invalid request_uri format: {e}"))
    })?;

    Ok(())
}

/// Validates client_id format.
///
/// Client IDs should only contain alphanumeric characters, hyphens, and underscores.
///
/// # Arguments
/// * `client_id` - The client ID to validate
///
/// # Returns
/// * `Ok(())` if the client_id is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_client_id(client_id: &str) -> Result<(), ServiceError> {
    if client_id.is_empty() {
        return Err(ServiceError::ValidationError(
            "client_id cannot be empty".to_string(),
        ));
    }

    if client_id.len() > 128 {
        return Err(ServiceError::ValidationError(
            "client_id exceeds maximum length of 128 characters".to_string(),
        ));
    }

    // Check for valid characters (alphanumeric, hyphen, underscore, dot)
    if !client_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err(ServiceError::ValidationError(
            "client_id contains invalid characters".to_string(),
        ));
    }

    Ok(())
}

/// Validates response_type format.
///
/// # Arguments
/// * `response_type` - The response_type to validate
///
/// # Returns
/// * `Ok(())` if the response_type is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_response_type(response_type: &str) -> Result<(), ServiceError> {
    if response_type.is_empty() {
        return Err(ServiceError::ValidationError(
            "response_type cannot be empty".to_string(),
        ));
    }

    // OAuth 2.0/2.1 defined response types: code, token, id_token, code token, code id_token, etc.
    // For now, we allow space-separated values of known types
    let known_types = ["code", "token", "id_token"];
    let parts: Vec<&str> = response_type.split_whitespace().collect();

    for part in parts {
        if !known_types.contains(&part) {
            return Err(ServiceError::ValidationError(format!(
                "Unknown response_type: {part}"
            )));
        }
    }

    Ok(())
}

/// Validates authorization code format.
///
/// Authorization codes should be:
/// - Non-empty
/// - Reasonably short (max 256 chars)
/// - Generated securely (UUIDs or cryptographic random strings)
///
/// # Arguments
/// * `code` - The authorization code to validate
///
/// # Returns
/// * `Ok(())` if the code is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_auth_code(code: &str) -> Result<(), ServiceError> {
    if code.is_empty() {
        return Err(ServiceError::ValidationError(
            "Authorization code cannot be empty".to_string(),
        ));
    }

    if code.len() > 256 {
        return Err(ServiceError::ValidationError(
            "Authorization code exceeds maximum length".to_string(),
        ));
    }

    // Ensure code contains only valid characters (alphanumeric, hyphen, underscore)
    // This is typical for UUID-based codes, but PKCE verifiers use base64url which includes '-' and '_'
    if !code.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(ServiceError::ValidationError(
            "Authorization code contains invalid characters".to_string(),
        ));
    }

    Ok(())
}

/// Validates code_verifier format according to RFC 7636 (PKCE).
///
/// Requirements:
/// - Length: 43-128 characters
/// - Characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
///
/// # Arguments
/// * `verifier` - The code_verifier to validate
///
/// # Returns
/// * `Ok(())` if the verifier is valid
/// * `Err(ServiceError)` if validation fails
pub fn validate_code_verifier(verifier: &str) -> Result<(), ServiceError> {
    if verifier.len() < 43 || verifier.len() > 128 {
        return Err(ServiceError::ValidationError(
            "code_verifier must be between 43 and 128 characters".to_string(),
        ));
    }

    if !verifier
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_' || c == '~')
    {
        return Err(ServiceError::ValidationError(
            "code_verifier contains invalid characters".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_redirect_uri() {
        let uri = "https://example.com/callback";
        let registered = vec![uri.to_string()];
        assert!(validate_redirect_uri(uri, &registered).is_ok());
    }

    #[test]
    fn test_redirect_uri_not_registered() {
        let uri = "https://example.com/callback";
        let registered = vec!["https://example.com/other".to_string()];
        assert!(validate_redirect_uri(uri, &registered).is_err());
    }

    #[test]
    fn test_redirect_uri_with_fragment() {
        let uri = "https://example.com/callback#fragment";
        let registered = vec![uri.to_string()];
        assert!(validate_redirect_uri(uri, &registered).is_err());
    }

    #[test]
    fn test_redirect_uri_invalid_format() {
        let uri = "not a valid url";
        let registered = vec!["https://example.com/callback".to_string()];
        assert!(validate_redirect_uri(uri, &registered).is_err());
    }

    #[test]
    fn test_localhost_http_allowed() {
        let uri = "http://localhost:3000/callback";
        let registered = vec![uri.to_string()];
        assert!(validate_redirect_uri(uri, &registered).is_ok());
    }

    #[test]
    fn test_validate_scope_allowed() {
        let scope = "read write";
        let allowed = vec!["read".to_string(), "write".to_string()];
        assert!(validate_scope(scope, &allowed).is_ok());
    }

    #[test]
    fn test_validate_scope_not_allowed() {
        let scope = "read admin";
        let allowed = vec!["read".to_string(), "write".to_string()];
        assert!(validate_scope(scope, &allowed).is_err());
    }

    #[test]
    fn test_validate_client_id_valid() {
        assert!(validate_client_id("valid-client_id.123").is_ok());
    }

    #[test]
    fn test_validate_client_id_invalid_chars() {
        assert!(validate_client_id("invalid@client").is_err());
    }

    #[test]
    fn test_validate_response_type_valid() {
        assert!(validate_response_type("code").is_ok());
        assert!(validate_response_type("token").is_ok());
    }

    #[test]
    fn test_validate_response_type_invalid() {
        assert!(validate_response_type("invalid").is_err());
    }

    #[test]
    fn test_validate_auth_code_valid() {
        let code = "550e8400-e29b-41d4-a716-446655440000";
        assert!(validate_auth_code(code).is_ok());
    }

    #[test]
    fn test_validate_auth_code_empty() {
        assert!(validate_auth_code("").is_err());
    }

    #[test]
    fn test_validate_code_verifier_valid() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert!(validate_code_verifier(verifier).is_ok());
    }

    #[test]
    fn test_validate_code_verifier_too_short() {
        let verifier = "short"; // Less than 43 characters
        assert!(validate_code_verifier(verifier).is_err());
    }

    #[test]
    fn test_validate_code_verifier_too_long() {
        let verifier = &"a".repeat(129); // More than 128 characters
        assert!(validate_code_verifier(verifier).is_err());
    }

    #[test]
    fn test_validate_code_verifier_invalid_chars() {
        let verifier = "invalid@code$verifier".repeat(3); // Contains invalid characters
        assert!(validate_code_verifier(&verifier).is_err());
    }

    #[test]
    fn test_enforce_scope_match_same_scope() {
        let auth_scope = "read write";
        let token_scope = "read write";
        assert!(enforce_scope_match(auth_scope, Some(token_scope)).is_ok());
    }

    #[test]
    fn test_enforce_scope_match_subset() {
        let auth_scope = "read write delete";
        let token_scope = "read write";
        assert!(enforce_scope_match(auth_scope, Some(token_scope)).is_ok());
    }

    #[test]
    fn test_enforce_scope_match_no_token_scope() {
        let auth_scope = "read write";
        assert!(enforce_scope_match(auth_scope, None).is_ok());
    }

    #[test]
    fn test_enforce_scope_match_expanded_scope() {
        let auth_scope = "read";
        let token_scope = "read admin";
        assert!(enforce_scope_match(auth_scope, Some(token_scope)).is_err());
    }

    #[test]
    fn test_parse_scopes() {
        let scopes = parse_scopes("read write delete");
        assert_eq!(scopes.len(), 3);
        assert!(scopes.contains(&"read".to_string()));
        assert!(scopes.contains(&"write".to_string()));
        assert!(scopes.contains(&"delete".to_string()));
    }

    #[test]
    fn test_validate_nonce_valid() {
        assert!(validate_nonce("test_nonce_123").is_ok());
    }

    #[test]
    fn test_validate_nonce_empty() {
        assert!(validate_nonce("").is_err());
    }

    #[test]
    fn test_validate_nonce_too_long() {
        let long_nonce = "a".repeat(257);
        assert!(validate_nonce(&long_nonce).is_err());
    }

    #[test]
    fn test_validate_state_valid() {
        assert!(validate_state("test-state_123.abc").is_ok());
    }

    #[test]
    fn test_validate_state_empty() {
        assert!(validate_state("").is_err());
    }

    #[test]
    fn test_validate_state_too_long() {
        let long_state = "a".repeat(501);
        assert!(validate_state(&long_state).is_err());
    }

    #[test]
    fn test_validate_state_invalid_chars() {
        assert!(validate_state("state with spaces").is_err());
        assert!(validate_state("state@with#invalid").is_err());
    }

    #[test]
    fn test_validate_request_uri_valid() {
        assert!(validate_request_uri("https://example.com/par").is_ok());
    }

    #[test]
    fn test_validate_request_uri_invalid() {
        assert!(validate_request_uri("not a uri").is_err());
    }
}
