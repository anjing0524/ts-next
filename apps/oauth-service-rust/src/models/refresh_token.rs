use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Represents a refresh token stored in the database, mapping to the `refresh_tokens` table.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RefreshToken {
    pub id: String,
    pub token: String,
    pub token_hash: Option<String>,
    pub jti: Option<String>,
    pub user_id: String,
    pub client_id: String,
    pub scope: String, // JSON string
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub is_revoked: bool,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub previous_token_id: Option<String>,
}
