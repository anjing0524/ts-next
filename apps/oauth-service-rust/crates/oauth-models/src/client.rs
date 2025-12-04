use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::fmt;

/// Enum for OAuth client types, mirroring the database schema.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "ClientType", rename_all = "UPPERCASE")]
pub enum ClientType {
    PUBLIC,
    CONFIDENTIAL,
}

impl fmt::Display for ClientType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ClientType::PUBLIC => write!(f, "PUBLIC"),
            ClientType::CONFIDENTIAL => write!(f, "CONFIDENTIAL"),
        }
    }
}

/// Represents the core data of an OAuth2 client from the `oauth_clients` table.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OAuthClient {
    pub id: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub client_type: ClientType,
    pub logo_uri: Option<String>,
    pub policy_uri: Option<String>,
    pub tos_uri: Option<String>,
    pub jwks_uri: Option<String>,
    pub token_endpoint_auth_method: String,
    pub require_pkce: bool,
    pub require_consent: bool,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub access_token_ttl: i32,
    pub refresh_token_ttl: i32,
    pub authorization_code_lifetime: Option<i32>,
    pub strict_redirect_uri_matching: bool,
    pub allow_localhost_redirect: bool,
    pub require_https_redirect: bool,
}

/// Represents a fully detailed OAuth2 client, including its related entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthClientDetails {
    #[serde(flatten)]
    pub client: OAuthClient,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub response_types: Vec<String>,
    pub allowed_scopes: Vec<String>,
    pub client_permissions: Vec<String>,
    pub ip_whitelist: Vec<String>,
}
