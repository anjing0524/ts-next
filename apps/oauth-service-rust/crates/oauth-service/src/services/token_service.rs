#![allow(clippy::uninlined_format_args)]
use crate::config::Config;
use crate::error::ServiceError;
use crate::models::client::OAuthClientDetails;
use crate::services::client_service::ClientService;
use crate::services::rbac_service::RBACService;
use crate::services::user_service::UserService;
use crate::utils::jwt::{self, TokenClaims};
use async_trait::async_trait;
use chrono::{Duration, Utc};
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

/// Represents the pair of tokens issued.
#[derive(Debug)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: u64,
}

/// The `TokenService` trait defines the logic for issuing, refreshing, and introspecting tokens.
#[async_trait]
pub trait TokenService: Send + Sync {
    async fn issue_tokens(
        &self,
        client: &OAuthClientDetails,
        user_id: Option<String>,
        scope: String,
        permissions: Vec<String>,
        nonce: Option<String>,
    ) -> Result<TokenPair, ServiceError>;

    async fn refresh_token(&self, refresh_token: &str) -> Result<TokenPair, ServiceError>;

    async fn introspect_token(&self, token: &str) -> Result<TokenClaims, ServiceError>;

    /// Revokes a token (access or refresh token).
    ///
    /// According to RFC 7009, the revocation endpoint allows a client to notify
    /// the authorization server that a previously obtained refresh or access token
    /// is no longer needed.
    ///
    /// # Arguments
    /// * `token` - The token to revoke
    /// * `token_type_hint` - Optional hint about the token type ("access_token" or "refresh_token")
    ///
    /// # Returns
    /// * `Ok(())` on successful revocation
    /// * `Err(ServiceError)` if the operation fails
    async fn revoke_token(
        &self,
        token: &str,
        token_type_hint: Option<&str>,
    ) -> Result<(), ServiceError>;

    /// Checks if a token is revoked/blacklisted.
    ///
    /// # Arguments
    /// * `jti` - The JWT ID (jti claim) to check
    ///
    /// # Returns
    /// * `Ok(true)` if the token is revoked
    /// * `Ok(false)` if the token is not revoked
    /// * `Err(ServiceError)` if the check fails
    async fn is_token_revoked(&self, jti: &str) -> Result<bool, ServiceError>;
}

pub struct TokenServiceImpl {
    db: Arc<SqlitePool>,
    client_service: Arc<dyn ClientService>,
    rbac_service: Arc<dyn RBACService>,
    user_service: Arc<dyn UserService>,
    config: Arc<Config>,
}

impl TokenServiceImpl {
    pub fn new(
        db: Arc<SqlitePool>,
        client_service: Arc<dyn ClientService>,
        rbac_service: Arc<dyn RBACService>,
        user_service: Arc<dyn UserService>,
        config: Arc<Config>,
    ) -> Self {
        Self {
            db,
            client_service,
            rbac_service,
            user_service,
            config,
        }
    }

    /// Issue tokens within a database transaction (for atomicity)
    /// This is a private helper method used by refresh_token to ensure atomic operations
    async fn issue_tokens_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
        client: &OAuthClientDetails,
        user_id: Option<String>,
        scope: String,
        permissions: Vec<String>,
        nonce: Option<String>,
    ) -> Result<TokenPair, ServiceError> {
        let encoding_key = self.config.load_encoding_key()?;
        let now = Utc::now();
        let access_token_ttl = client.client.access_token_ttl as u64;
        let access_token_exp = now + Duration::seconds(access_token_ttl as i64);

        let access_token_claims = TokenClaims {
            sub: user_id.clone(),
            client_id: client.client.client_id.clone(),
            scope: scope.clone(),
            permissions,
            exp: access_token_exp.timestamp() as usize,
            iat: now.timestamp() as usize,
            jti: Uuid::new_v4().to_string(),
        };

        let access_token = jwt::generate_token_with_algorithm(
            &access_token_claims,
            &encoding_key,
            self.config.jwt_algorithm,
        )?;

        let mut issued_refresh_token: Option<String> = None;
        let mut issued_id_token: Option<String> = None;

        if let Some(uid) = user_id {
            // Generate refresh token
            let refresh_token_ttl = client.client.refresh_token_ttl as i64;
            let refresh_token_exp = now + Duration::seconds(refresh_token_ttl);
            let refresh_jti = Uuid::new_v4().to_string();

            let refresh_token_claims = TokenClaims {
                sub: Some(uid.clone()),
                client_id: client.client.client_id.clone(),
                scope: scope.clone(),
                permissions: vec![], // Refresh tokens don't carry permissions
                exp: refresh_token_exp.timestamp() as usize,
                iat: now.timestamp() as usize,
                jti: refresh_jti.clone(),
            };

            let refresh_token = jwt::generate_token_with_algorithm(
                &refresh_token_claims,
                &encoding_key,
                self.config.jwt_algorithm,
            )?;
            let refresh_token_hash = crate::utils::crypto::hash_password(&refresh_token)?;
            let refresh_id = Uuid::new_v4().to_string();

            // Insert refresh token within transaction
            sqlx::query(
                "INSERT INTO refresh_tokens (id, token, token_hash, jti, user_id, client_id, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&refresh_id)
            .bind(&refresh_token)
            .bind(&refresh_token_hash)
            .bind(&refresh_jti)
            .bind(&uid)
            .bind(&client.client.id)
            .bind(&scope)
            .bind(&refresh_token_exp)
            .bind(&now)
            .execute(&mut **tx)
            .await?;

            issued_refresh_token = Some(refresh_token);

            // Generate ID Token if scope includes "openid"
            if scope.contains("openid") {
                let user = self.user_service.find_by_id(&uid).await?;
                if let Some(user) = user {
                    let id_token = jwt::generate_id_token_with_algorithm(
                        &user,
                        &client.client.client_id,
                        &scope,
                        &self.config.issuer,
                        nonce.as_deref(),
                        &encoding_key,
                        access_token_ttl,
                        self.config.jwt_algorithm,
                    )?;
                    issued_id_token = Some(id_token);
                }
            }
        }

        Ok(TokenPair {
            access_token,
            refresh_token: issued_refresh_token,
            id_token: issued_id_token,
            expires_in: access_token_ttl,
        })
    }
}

#[async_trait]
impl TokenService for TokenServiceImpl {
    async fn issue_tokens(
        &self,
        client: &OAuthClientDetails,
        user_id: Option<String>,
        scope: String,
        permissions: Vec<String>,
        nonce: Option<String>,
    ) -> Result<TokenPair, ServiceError> {
        let encoding_key = self.config.load_encoding_key()?;
        let now = Utc::now();
        let access_token_ttl = client.client.access_token_ttl as u64;
        let access_token_exp = now + Duration::seconds(access_token_ttl as i64);

        let access_token_claims = TokenClaims {
            sub: user_id.clone(),
            client_id: client.client.client_id.clone(),
            scope: scope.clone(),
            permissions,
            exp: access_token_exp.timestamp() as usize,
            iat: now.timestamp() as usize,
            jti: Uuid::new_v4().to_string(),
        };

        let access_token = jwt::generate_token_with_algorithm(
            &access_token_claims,
            &encoding_key,
            self.config.jwt_algorithm,
        )?;

        let mut issued_refresh_token: Option<String> = None;
        let mut issued_id_token: Option<String> = None;

        if let Some(uid) = user_id {
            // Generate refresh token
            let refresh_token_ttl = client.client.refresh_token_ttl as i64;
            let refresh_token_exp = now + Duration::seconds(refresh_token_ttl);
            let refresh_jti = Uuid::new_v4().to_string();

            let refresh_token_claims = TokenClaims {
                sub: Some(uid.clone()),
                client_id: client.client.client_id.clone(),
                scope: scope.clone(),
                permissions: vec![], // Refresh tokens don't carry permissions
                exp: refresh_token_exp.timestamp() as usize,
                iat: now.timestamp() as usize,
                jti: refresh_jti.clone(),
            };

            let refresh_token = jwt::generate_token_with_algorithm(
                &refresh_token_claims,
                &encoding_key,
                self.config.jwt_algorithm,
            )?;
            let refresh_token_hash = crate::utils::crypto::hash_password(&refresh_token)?;
            let refresh_id = Uuid::new_v4().to_string();

            sqlx::query(
                "INSERT INTO refresh_tokens (id, token, token_hash, jti, user_id, client_id, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&refresh_id)
            .bind(&refresh_token)
            .bind(&refresh_token_hash)
            .bind(&refresh_jti)
            .bind(&uid)
            .bind(&client.client.id)
            .bind(&scope)
            .bind(&refresh_token_exp)
            .bind(&now)
            .execute(&*self.db)
            .await?;

            issued_refresh_token = Some(refresh_token);

            // Generate ID Token if scope includes "openid"
            if scope.contains("openid") {
                let user = self.user_service.find_by_id(&uid).await?;
                if let Some(user) = user {
                    let id_token = jwt::generate_id_token_with_algorithm(
                        &user,
                        &client.client.client_id,
                        &scope,
                        &self.config.issuer,
                        nonce.as_deref(),
                        &encoding_key,
                        access_token_ttl,
                        self.config.jwt_algorithm,
                    )?;
                    issued_id_token = Some(id_token);
                }
            }
        }

        Ok(TokenPair {
            access_token,
            refresh_token: issued_refresh_token,
            id_token: issued_id_token,
            expires_in: access_token_ttl,
        })
    }

    async fn refresh_token(&self, refresh_token: &str) -> Result<TokenPair, ServiceError> {
        let decoding_key = self.config.load_decoding_key()?;
        // 1. Verify the incoming refresh token
        let claims = jwt::verify_token(refresh_token, &decoding_key)?;

        // 2. Find the token in the database by its JTI and ensure it's valid
        let jti = claims.jti.clone();
        let stored_token = sqlx::query_as::<_, crate::models::refresh_token::RefreshToken>(
            "SELECT id, token, token_hash, jti, user_id, client_id, scope, expires_at, \
             is_revoked, revoked_at, created_at, previous_token_id \
             FROM refresh_tokens WHERE jti = ?",
        )
        .bind(&jti)
        .fetch_optional(&*self.db)
        .await?
        .ok_or_else(|| ServiceError::Unauthorized("Invalid refresh token".to_string()))?;

        if stored_token.is_revoked {
            return Err(ServiceError::Unauthorized(
                "Refresh token has been revoked".to_string(),
            ));
        }

        if stored_token.expires_at < Utc::now() {
            return Err(ServiceError::Unauthorized(
                "Refresh token has expired".to_string(),
            ));
        }

        // Get client and user info before starting transaction
        let client = self
            .client_service
            .find_by_client_id(&claims.client_id)
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(format!("Client {} not found", claims.client_id))
            })?;

        let user_id = claims.sub.ok_or_else(|| {
            ServiceError::ValidationError("User ID missing in refresh token claims".to_string())
        })?;
        let permissions = self.rbac_service.get_user_permissions(&user_id).await?;

        // 3. Use transaction to ensure atomicity: revoke old token and issue new tokens
        let mut tx = self.db.begin().await?;

        // Revoke the old token within transaction
        let now = Utc::now();
        sqlx::query(
            "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = ? WHERE id = ?",
        )
        .bind(&now)
        .bind(&stored_token.id)
        .execute(&mut *tx)
        .await?;

        // 4. Issue new tokens within transaction
        let token_pair = self.issue_tokens_tx(
            &mut tx,
            &client,
            Some(user_id),
            claims.scope,
            permissions,
            None, // No nonce for refresh token flow
        )
        .await?;

        // Commit transaction - if this fails, everything rolls back
        tx.commit().await?;

        Ok(token_pair)
    }

    async fn introspect_token(&self, token: &str) -> Result<TokenClaims, ServiceError> {
        let decoding_key = self.config.load_decoding_key()?;
        // 1. Verify the token signature and expiration
        let claims = jwt::verify_token(token, &decoding_key)?;

        // 2. Check if token is in blacklist
        let is_revoked = self.is_token_revoked(&claims.jti).await?;
        if is_revoked {
            return Err(ServiceError::ValidationError(
                "Token has been revoked".to_string(),
            ));
        }

        // 3. If it might be a refresh token (check by JTI), see if it has been revoked.
        // This is a simplified check. A full implementation would distinguish token types more robustly.
        if let Some(stored_token) = sqlx::query_as::<_, crate::models::refresh_token::RefreshToken>(
            "SELECT id, token, token_hash, jti, user_id, client_id, scope, expires_at, \
             is_revoked, revoked_at, created_at, previous_token_id \
             FROM refresh_tokens WHERE jti = ?",
        )
        .bind(&claims.jti)
        .fetch_optional(&*self.db)
        .await?
        {
            if stored_token.is_revoked {
                return Err(ServiceError::ValidationError(
                    "Token has been revoked".to_string(),
                ));
            }
        }

        Ok(claims)
    }

    async fn revoke_token(
        &self,
        token: &str,
        token_type_hint: Option<&str>,
    ) -> Result<(), ServiceError> {
        let decoding_key = self.config.load_decoding_key()?;

        // 1. Verify the token signature (but allow expired tokens)
        let claims = match jwt::verify_token(token, &decoding_key) {
            Ok(claims) => claims,
            Err(_) => {
                // RFC 7009: If the server is unable to determine whether the token is valid or not,
                // it SHOULD treat it as revoked for security purposes
                tracing::warn!("Attempted to revoke invalid/unparseable token");
                return Ok(());
            }
        };

        let jti = &claims.jti;
        let now = Utc::now();
        let token_id = Uuid::new_v4().to_string();
        let expires_at = now + Duration::seconds(3600); // Blacklist expires 1 hour after revocation

        // 2. Determine token type and handle accordingly
        let token_type = token_type_hint.unwrap_or("refresh_token");

        // 3. Add to blacklist
        sqlx::query(
            "INSERT INTO token_blacklist (id, jti, token_type, user_id, client_id, expires_at, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&token_id)
        .bind(jti)
        .bind(&token_type)
        .bind(&claims.sub)
        .bind(&claims.client_id)
        .bind(&expires_at)
        .bind("User initiated revocation")
        .bind(&now)
        .execute(&*self.db)
        .await?;

        // 4. If it's a refresh token, also mark it as revoked in refresh_tokens table
        if token_type == "refresh_token" {
            sqlx::query(
                "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = ? WHERE jti = ?",
            )
            .bind(&now)
            .bind(jti)
            .execute(&*self.db)
            .await?;
        }

        tracing::info!(
            "Token revoked: jti={}, type={}, user={}, client={}",
            jti,
            token_type,
            claims.sub.unwrap_or_default(),
            claims.client_id
        );

        Ok(())
    }

    async fn is_token_revoked(&self, jti: &str) -> Result<bool, ServiceError> {
        let now = Utc::now();

        // Check token_blacklist table
        let blacklist_entry: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM token_blacklist WHERE jti = ? AND expires_at > ?",
        )
        .bind(jti)
        .bind(&now)
        .fetch_optional(&*self.db)
        .await?;

        Ok(blacklist_entry.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::permission_cache::InMemoryPermissionCache;
    use crate::config::Config;
    use crate::models::client::OAuthClientDetails;
    use crate::routes::clients::CreateClientRequest;
    use crate::services::client_service::{ClientService, ClientServiceImpl};
    use crate::services::rbac_service::{RBACService, RBACServiceImpl};
    use crate::services::user_service::{UserService, UserServiceImpl};
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create db");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to migrate");
        pool
    }

    fn generate_test_keys() -> (EncodingKey, DecodingKey) {
        let secret = b"test_secret";
        (
            EncodingKey::from_secret(secret),
            DecodingKey::from_secret(secret),
        )
    }

    async fn create_test_client(pool: &SqlitePool) -> OAuthClientDetails {
        let client_service = ClientServiceImpl::new(Arc::new(pool.clone()));
        let request = CreateClientRequest {
            name: "Test Client".to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec![
                "authorization_code".to_string(),
                "refresh_token".to_string(),
            ],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string(), "write".to_string()],
            client_permissions: None,
        };
        let (client, _) = client_service
            .create_client(request)
            .await
            .expect("Failed to create test client");
        client
    }

    async fn create_test_user(pool: &SqlitePool) -> String {
        let user_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
        )
        .bind(&user_id)
        .bind("testuser")
        .bind("hashedpassword")
        .execute(pool)
        .await
        .expect("Failed to create test user");
        user_id
    }

    fn create_test_config() -> Config {
        // Set JWT_SECRET for testing (required since hardcoded fallback was removed)
        std::env::set_var("JWT_SECRET", "test_jwt_secret_key_for_testing_only_do_not_use_in_production");

        Config {
            database_url: "sqlite::memory:".to_string(),
            jwt_private_key_path: "".to_string(),
            jwt_public_key_path: "".to_string(),
            issuer: "test_issuer".to_string(),
            jwt_algorithm: crate::config::JwtAlgorithm::HS256,
        }
    }

    #[tokio::test]
    async fn test_issue_tokens_with_user() {
        let pool = setup_test_db().await;
        let db = Arc::new(pool);
        let _keys = generate_test_keys();

        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let client_service = Arc::new(ClientServiceImpl::new(db.clone())) as Arc<dyn ClientService>;
        let rbac_service = Arc::new(RBACServiceImpl::new(db.clone(), permission_cache)) as Arc<dyn RBACService>;
        let user_service = Arc::new(UserServiceImpl::new(db.clone())) as Arc<dyn UserService>;
        let config = Arc::new(create_test_config());

        let token_service = TokenServiceImpl::new(
            db.clone(),
            client_service,
            rbac_service,
            user_service,
            config,
        );

        let client = create_test_client(&db).await;
        let user_id = create_test_user(&db).await;

        let result = token_service
            .issue_tokens(
                &client,
                Some(user_id.clone()),
                "read write".to_string(),
                vec!["read:data".to_string(), "write:data".to_string()],
                None,
            )
            .await;

        assert!(result.is_ok());
        let token_pair = result.unwrap();
        assert!(!token_pair.access_token.is_empty());
        assert!(token_pair.refresh_token.is_some());
        assert!(token_pair.expires_in > 0);
    }

    #[tokio::test]
    async fn test_issue_tokens_without_user() {
        let pool = setup_test_db().await;
        let db = Arc::new(pool);
        let _keys = generate_test_keys();

        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let client_service = Arc::new(ClientServiceImpl::new(db.clone())) as Arc<dyn ClientService>;
        let rbac_service = Arc::new(RBACServiceImpl::new(db.clone(), permission_cache)) as Arc<dyn RBACService>;
        let user_service = Arc::new(UserServiceImpl::new(db.clone())) as Arc<dyn UserService>;
        let config = Arc::new(create_test_config());

        let token_service = TokenServiceImpl::new(
            db.clone(),
            client_service,
            rbac_service,
            user_service,
            config,
        );

        let client = create_test_client(&db).await;

        let result = token_service
            .issue_tokens(
                &client,
                None, // No user (client credentials flow)
                "read".to_string(),
                vec![],
                None,
            )
            .await;

        assert!(result.is_ok());
        let token_pair = result.unwrap();
        assert!(!token_pair.access_token.is_empty());
        assert!(token_pair.refresh_token.is_none());
    }

    #[tokio::test]
    async fn test_revoke_token() {
        let pool = setup_test_db().await;
        let db = Arc::new(pool);
        let _keys = generate_test_keys();

        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let client_service = Arc::new(ClientServiceImpl::new(db.clone())) as Arc<dyn ClientService>;
        let rbac_service = Arc::new(RBACServiceImpl::new(db.clone(), permission_cache)) as Arc<dyn RBACService>;
        let user_service = Arc::new(UserServiceImpl::new(db.clone())) as Arc<dyn UserService>;
        let config = Arc::new(create_test_config());

        let token_service = TokenServiceImpl::new(
            db.clone(),
            client_service,
            rbac_service,
            user_service,
            config,
        );

        let client = create_test_client(&db).await;
        let user_id = create_test_user(&db).await;

        // 1. Issue a token
        let token_pair = token_service
            .issue_tokens(
                &client,
                Some(user_id.clone()),
                "read write".to_string(),
                vec!["read:data".to_string(), "write:data".to_string()],
                None,
            )
            .await
            .expect("Failed to issue tokens");

        let refresh_token = token_pair.refresh_token.expect("No refresh token");

        // 2. Verify token is valid before revocation
        let verify_result = token_service
            .introspect_token(&refresh_token)
            .await;
        assert!(verify_result.is_ok(), "Token should be valid before revocation");

        // 3. Revoke the token
        let revoke_result = token_service
            .revoke_token(&refresh_token, Some("refresh_token"))
            .await;
        assert!(revoke_result.is_ok(), "Token revocation should succeed");

        // 4. Verify token is revoked
        let verify_after_revoke = token_service
            .introspect_token(&refresh_token)
            .await;
        assert!(
            verify_after_revoke.is_err(),
            "Token should be invalid after revocation"
        );
    }

    #[tokio::test]
    async fn test_is_token_revoked() {
        let pool = setup_test_db().await;
        let db = Arc::new(pool);

        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let client_service = Arc::new(ClientServiceImpl::new(db.clone())) as Arc<dyn ClientService>;
        let rbac_service = Arc::new(RBACServiceImpl::new(db.clone(), permission_cache)) as Arc<dyn RBACService>;
        let user_service = Arc::new(UserServiceImpl::new(db.clone())) as Arc<dyn UserService>;
        let config = Arc::new(create_test_config());

        let token_service = TokenServiceImpl::new(
            db.clone(),
            client_service,
            rbac_service,
            user_service,
            config,
        );

        // Non-existent token should not be revoked
        let is_revoked = token_service
            .is_token_revoked("nonexistent-jti")
            .await
            .expect("Failed to check revocation");
        assert!(!is_revoked, "Non-existent token should not be revoked");
    }
}
