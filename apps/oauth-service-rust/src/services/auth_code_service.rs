use crate::error::ServiceError;
use crate::models::auth_code::AuthCode;
use crate::routes::oauth::AuthorizeRequest;
use crate::services::client_service::ClientService;
use crate::utils::validation;
use async_trait::async_trait;
use chrono::{Duration, Utc};
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

#[async_trait]
pub trait AuthCodeService: Send + Sync {
    async fn create_auth_code(
        &self,
        params: &AuthorizeRequest,
        user_id: &str,
    ) -> Result<String, ServiceError>;
    async fn find_and_consume_code(&self, code: &str) -> Result<AuthCode, ServiceError>;
}

pub struct AuthCodeServiceImpl {
    db: Arc<SqlitePool>,
    client_service: Arc<dyn ClientService>,
}

impl AuthCodeServiceImpl {
    pub fn new(db: Arc<SqlitePool>, client_service: Arc<dyn ClientService>) -> Self {
        Self { db, client_service }
    }
}

#[async_trait]
impl AuthCodeService for AuthCodeServiceImpl {
    async fn create_auth_code(
        &self,
        params: &AuthorizeRequest,
        user_id: &str,
    ) -> Result<String, ServiceError> {
        let client = self
            .client_service
            .find_by_client_id(&params.client_id)
            .await?;
        let client =
            client.ok_or_else(|| ServiceError::NotFound("Client not found".to_string()))?;

        // === OAuth 2.1 合规性验证 ===

        // 1. 验证 redirect_uri 是否在注册的列表中 (RFC 6749 Section 3.1.2)
        validation::validate_redirect_uri(&params.redirect_uri, &client.redirect_uris)?;

        // 2. 验证请求的作用域是否在允许范围内 (RFC 6749 Section 3.3)
        validation::validate_scope(&params.scope, &client.allowed_scopes)?;

        // 3. OAuth 2.1 要求：PUBLIC 客户端必须使用 PKCE
        // (https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-09#section-7.2.1)
        if client.client.client_type == crate::models::client::ClientType::PUBLIC {
            if params.code_challenge.is_empty() {
                return Err(ServiceError::ValidationError(
                    "OAuth 2.1 requires PKCE (code_challenge) for public clients".to_string(),
                ));
            }
            // 验证 code_challenge 格式
            validation::validate_code_verifier(&params.code_challenge)?;
        }

        let code = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + Duration::minutes(10);
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now();

        sqlx::query(
            "INSERT INTO authorization_codes (id, user_id, client_id, code, redirect_uri, scope, expires_at, code_challenge, code_challenge_method, nonce, is_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(user_id)
        .bind(&client.client.id) // Use the internal CUID
        .bind(&code)
        .bind(&params.redirect_uri)
        .bind(&params.scope)
        .bind(expires_at)
        .bind(&params.code_challenge)
        .bind(&params.code_challenge_method)
        .bind(&params.nonce)
        .bind(false)
        .bind(created_at)
        .execute(&*self.db)
        .await?;

        Ok(code)
    }

    async fn find_and_consume_code(&self, code: &str) -> Result<AuthCode, ServiceError> {
        // 1. Validate code format
        validation::validate_auth_code(code)?;

        let mut tx = self.db.begin().await?;

        // 2. Find the code in database
        let auth_code =
            sqlx::query_as::<_, AuthCode>(
                "SELECT id, code, user_id, client_id, redirect_uri, scope, expires_at, \
                 code_challenge, code_challenge_method, nonce, is_used, created_at \
                 FROM authorization_codes WHERE code = ?"
            )
                .bind(code)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| {
                    tracing::warn!("Authorization code not found: {}", code);
                    ServiceError::ValidationError("Invalid authorization code".to_string())
                })?;

        // 3. Check if code has already been used (prevents reuse attacks)
        if auth_code.is_used {
            tracing::warn!(
                "Authorization code reuse attempted for code: {} (user: {}, client: {})",
                code,
                auth_code.user_id,
                auth_code.client_id
            );
            return Err(ServiceError::ValidationError(
                "Authorization code has already been used".to_string(),
            ));
        }

        // 4. Check if code has expired
        if auth_code.expires_at < Utc::now() {
            tracing::info!("Authorization code expired: {} (was valid until {:?})", code, auth_code.expires_at);
            return Err(ServiceError::ValidationError(
                "Authorization code has expired".to_string(),
            ));
        }

        // 5. Mark code as used (one-time use enforcement)
        // Use transaction for atomicity
        sqlx::query("UPDATE authorization_codes SET is_used = TRUE WHERE id = ?")
            .bind(&auth_code.id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        Ok(auth_code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::client_service::ClientServiceImpl;
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

    // Helper to create a client and a user for the tests
    async fn setup_test_dependencies(pool: &SqlitePool) -> (String, String) {
        use crate::routes::clients::CreateClientRequest;

        let client_service = ClientServiceImpl::new(Arc::new(pool.clone()));
        let request = CreateClientRequest {
            name: "Test Client".to_string(),
            client_type: "PUBLIC".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };
        let (client, _) = client_service.create_client(request).await.unwrap();

        let user_id = "user_123".to_string();
        sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
            .bind(&user_id)
            .bind("testuser")
            .bind("password")
            .execute(pool)
            .await
            .unwrap();

        (client.client.client_id, user_id)
    }

    fn create_test_request(client_id: String) -> AuthorizeRequest {
        AuthorizeRequest {
            client_id,
            redirect_uri: "http://localhost:3000/callback".to_string(),
            response_type: "code".to_string(),
            scope: "read write".to_string(),
            code_challenge: "test_challenge".to_string(),
            code_challenge_method: "S256".to_string(),
            nonce: Some("test_nonce".to_string()),
        }
    }

    #[tokio::test]
    async fn test_create_auth_code() {
        let db = Arc::new(setup_test_db().await);
        let client_service = Arc::new(ClientServiceImpl::new(db.clone()));
        let service = AuthCodeServiceImpl::new(db.clone(), client_service);

        let (client_id, user_id) = setup_test_dependencies(&db).await;
        let request = create_test_request(client_id.clone());

        let result = service.create_auth_code(&request, &user_id).await;
        assert!(result.is_ok());

        let code = result.unwrap();
        let auth_code =
            sqlx::query_as::<_, AuthCode>(
                "SELECT id, code, user_id, client_id, redirect_uri, scope, expires_at, \
                 code_challenge, code_challenge_method, nonce, is_used, created_at \
                 FROM authorization_codes WHERE code = ?"
            )
                .bind(&code)
                .fetch_one(&*db)
                .await
                .unwrap();

        assert_eq!(auth_code.user_id, user_id);
        assert!(!auth_code.client_id.is_empty()); // Internal ID is not the same as external
    }
}
