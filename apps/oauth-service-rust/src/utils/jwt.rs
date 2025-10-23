use crate::config::JwtAlgorithm;
use crate::error::ServiceError;
use crate::models::user::User;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

/// The claims present in the JWT.
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct TokenClaims {
    pub sub: Option<String>, // Subject (user_id)
    pub client_id: String,
    pub scope: String,
    pub permissions: Vec<String>,
    pub exp: usize,  // Expiration time
    pub iat: usize,  // Issued at
    pub jti: String, // JWT ID
}

/// The claims present in the ID Token (OpenID Connect).
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct IdTokenClaims {
    // Required claims
    pub iss: String,              // Issuer
    pub sub: String,              // Subject (user_id)
    pub aud: String,              // Audience (client_id)
    pub exp: usize,               // Expiration time
    pub iat: usize,               // Issued at
    pub auth_time: Option<usize>, // Authentication time
    pub nonce: Option<String>,    // Nonce for replay protection

    // Optional claims
    pub name: Option<String>,               // Full name
    pub given_name: Option<String>,         // Given name
    pub family_name: Option<String>,        // Family name
    pub preferred_username: Option<String>, // Preferred username
    pub email: Option<String>,              // Email
    pub picture: Option<String>,            // Profile picture URL

    // Custom claims
    pub client_id: String,
    pub scope: String,
}

/// Generates a new JWT token with specified algorithm.
pub fn generate_token_with_algorithm(
    claims: &TokenClaims,
    encoding_key: &EncodingKey,
    algorithm: JwtAlgorithm,
) -> Result<String, ServiceError> {
    let algo = match algorithm {
        JwtAlgorithm::HS256 => Algorithm::HS256,
        JwtAlgorithm::RS256 => Algorithm::RS256,
    };
    let header = Header::new(algo);
    encode(&header, claims, encoding_key).map_err(|e| {
        tracing::error!("JWT encoding with {} failed: {:?}", algorithm.as_str(), e);
        ServiceError::JwtError(e.to_string())
    })
}

/// Generates a new JWT token using HS256 algorithm (default for backward compatibility).
pub fn generate_token(
    claims: &TokenClaims,
    encoding_key: &EncodingKey,
) -> Result<String, ServiceError> {
    generate_token_with_algorithm(claims, encoding_key, JwtAlgorithm::HS256)
}

/// Verifies a JWT token and returns its claims with specified algorithm.
pub fn verify_token_with_algorithm(
    token: &str,
    decoding_key: &DecodingKey,
    algorithm: JwtAlgorithm,
) -> Result<TokenClaims, ServiceError> {
    let algo = match algorithm {
        JwtAlgorithm::HS256 => Algorithm::HS256,
        JwtAlgorithm::RS256 => Algorithm::RS256,
    };
    let mut validation = Validation::new(algo);
    validation.validate_exp = true;
    decode::<TokenClaims>(token, decoding_key, &validation)
        .map(|data| data.claims)
        .map_err(|e| {
            tracing::error!("JWT decoding with {} failed: {:?}", algorithm.as_str(), e);
            ServiceError::JwtError(e.to_string())
        })
}

/// Verifies a JWT token and returns its claims using HS256 (default for backward compatibility).
pub fn verify_token(token: &str, decoding_key: &DecodingKey) -> Result<TokenClaims, ServiceError> {
    verify_token_with_algorithm(token, decoding_key, JwtAlgorithm::HS256)
}

/// Generates a new ID Token (OpenID Connect) with specified algorithm.
#[allow(clippy::too_many_arguments)]
pub fn generate_id_token_with_algorithm(
    user: &User,
    client_id: &str,
    scope: &str,
    issuer: &str,
    nonce: Option<&str>,
    encoding_key: &EncodingKey,
    expires_in_seconds: u64,
    algorithm: JwtAlgorithm,
) -> Result<String, ServiceError> {
    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::seconds(expires_in_seconds as i64)).timestamp() as usize;
    let iat = now.timestamp() as usize;

    // Extract user information for claims
    let name = user
        .display_name
        .clone()
        .or_else(|| match (&user.first_name, &user.last_name) {
            (Some(first), Some(last)) => Some(format!("{first} {last}")),
            (Some(first), None) => Some(first.clone()),
            (None, Some(last)) => Some(last.clone()),
            (None, None) => None,
        });

    let claims = IdTokenClaims {
        iss: issuer.to_string(),
        sub: user.id.clone(),
        aud: client_id.to_string(),
        exp,
        iat,
        auth_time: Some(iat),
        nonce: nonce.map(|n| n.to_string()),
        name,
        given_name: user.first_name.clone(),
        family_name: user.last_name.clone(),
        preferred_username: Some(user.username.clone()),
        email: None,
        picture: user.avatar.clone(),
        client_id: client_id.to_string(),
        scope: scope.to_string(),
    };

    let algo = match algorithm {
        JwtAlgorithm::HS256 => Algorithm::HS256,
        JwtAlgorithm::RS256 => Algorithm::RS256,
    };
    let header = Header::new(algo);
    encode(&header, &claims, encoding_key).map_err(|e| {
        tracing::error!(
            "ID token encoding with {} failed: {:?}",
            algorithm.as_str(),
            e
        );
        ServiceError::JwtError(e.to_string())
    })
}

/// Generates a new ID Token (OpenID Connect) using HS256 (default for backward compatibility).
pub fn generate_id_token(
    user: &User,
    client_id: &str,
    scope: &str,
    issuer: &str,
    nonce: Option<&str>,
    encoding_key: &EncodingKey,
    expires_in_seconds: u64,
) -> Result<String, ServiceError> {
    generate_id_token_with_algorithm(
        user,
        client_id,
        scope,
        issuer,
        nonce,
        encoding_key,
        expires_in_seconds,
        JwtAlgorithm::HS256,
    )
}

/// Generates a new ID Token (OpenID Connect) with configuration-based algorithm.
#[allow(clippy::too_many_arguments)]
pub fn generate_id_token_configured(
    user: &User,
    client_id: &str,
    scope: &str,
    issuer: &str,
    nonce: Option<&str>,
    encoding_key: &EncodingKey,
    expires_in_seconds: u64,
    algorithm: JwtAlgorithm,
) -> Result<String, ServiceError> {
    generate_id_token_with_algorithm(
        user,
        client_id,
        scope,
        issuer,
        nonce,
        encoding_key,
        expires_in_seconds,
        algorithm,
    )
}
