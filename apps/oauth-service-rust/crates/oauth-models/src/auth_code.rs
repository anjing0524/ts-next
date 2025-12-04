use sqlx::FromRow;

/// Represents an authorization code stored in the database, mapping to the `authorization_codes` table.
#[derive(Debug, FromRow)]
pub struct AuthCode {
    pub id: String,
    pub user_id: String,
    pub client_id: String,
    pub code: String,
    pub redirect_uri: String,
    pub scope: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub code_challenge: Option<String>,
    pub code_challenge_method: Option<String>,
    pub nonce: Option<String>,
    pub is_used: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
