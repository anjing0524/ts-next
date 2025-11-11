use crate::error::ServiceError;
use crate::models::client::{ClientType, OAuthClient, OAuthClientDetails};
use crate::utils::crypto;
use async_trait::async_trait;
use chrono::Utc;
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

#[async_trait]
pub trait ClientService: Send + Sync {
    async fn find_by_client_id(
        &self,
        client_id: &str,
    ) -> Result<Option<OAuthClientDetails>, ServiceError>;
    async fn authenticate_client(
        &self,
        client_id: &str,
        client_secret: Option<&str>,
    ) -> Result<OAuthClientDetails, ServiceError>;
    async fn create_client(
        &self,
        request: crate::routes::clients::CreateClientRequest,
    ) -> Result<(OAuthClientDetails, String), ServiceError>;
    async fn list_clients(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<OAuthClientDetails>, ServiceError>;
    async fn update_client(
        &self,
        client_id: &str,
        name: Option<String>,
        redirect_uris: Option<Vec<String>>,
        allowed_scopes: Option<Vec<String>>,
        is_active: Option<bool>,
    ) -> Result<OAuthClientDetails, ServiceError>;
    async fn delete_client(&self, client_id: &str) -> Result<(), ServiceError>;
    async fn get_internal_client(&self) -> Result<OAuthClientDetails, ServiceError>;
}

pub struct ClientServiceImpl {
    db: Arc<SqlitePool>,
}

impl ClientServiceImpl {
    pub fn new(db: Arc<SqlitePool>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl ClientService for ClientServiceImpl {
    async fn find_by_client_id(
        &self,
        client_id: &str,
    ) -> Result<Option<OAuthClientDetails>, ServiceError> {
        let client: Option<OAuthClient> =
            sqlx::query_as("SELECT * FROM oauth_clients WHERE client_id = ?")
                .bind(client_id)
                .fetch_optional(&*self.db)
                .await?;

        if let Some(client) = client {
            // Optimize: Use reference instead of cloning client.id
            // Parallelize all related table queries using tokio::join!
            // This reduces I/O latency from sequential (6+ queries in series)
            // to concurrent (6 queries in parallel)
            let (redirect_uris, grant_types, response_types, allowed_scopes, client_permissions, ip_whitelist) =
                tokio::join!(
                    async {
                        sqlx::query_scalar("SELECT uri FROM client_redirect_uris WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    },
                    async {
                        sqlx::query_scalar("SELECT grant_type FROM client_grant_types WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    },
                    async {
                        sqlx::query_scalar("SELECT response_type FROM client_response_types WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    },
                    async {
                        sqlx::query_scalar("SELECT scope FROM client_allowed_scopes WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    },
                    async {
                        sqlx::query_scalar("SELECT permission FROM client_permissions WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    },
                    async {
                        sqlx::query_scalar("SELECT ip_address FROM client_ip_whitelist WHERE client_id = ?")
                            .bind(&client.id)
                            .fetch_all(&*self.db)
                            .await
                            .unwrap_or_default()
                    }
                );

            Ok(Some(OAuthClientDetails {
                client,
                redirect_uris,
                grant_types,
                response_types,
                allowed_scopes,
                client_permissions,
                ip_whitelist,
            }))
        } else {
            Ok(None)
        }
    }

    async fn authenticate_client(
        &self,
        client_id: &str,
        client_secret: Option<&str>,
    ) -> Result<OAuthClientDetails, ServiceError> {
        let client_details = self
            .find_by_client_id(client_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Client '{client_id}' not found")))?;

        if !client_details.client.is_active {
            return Err(ServiceError::Unauthorized("Client is inactive".to_string()));
        }

        if client_details.client.client_type == crate::models::client::ClientType::CONFIDENTIAL {
            let provided_secret = client_secret
                .ok_or_else(|| ServiceError::Unauthorized("Client secret required".to_string()))?;

            let secret_hash = client_details
                .client
                .client_secret
                .as_ref()
                .ok_or_else(|| {
                    ServiceError::Internal(
                        "Confidential client is missing a secret hash".to_string(),
                    )
                })?;

            if !crypto::verify_password(provided_secret, secret_hash)? {
                return Err(ServiceError::Unauthorized(
                    "Invalid client secret".to_string(),
                ));
            }
        }

        Ok(client_details)
    }

    async fn create_client(
        &self,
        request: crate::routes::clients::CreateClientRequest,
    ) -> Result<(OAuthClientDetails, String), ServiceError> {
        let client_type_enum = match request.client_type.to_uppercase().as_str() {
            "PUBLIC" => ClientType::PUBLIC,
            "CONFIDENTIAL" => ClientType::CONFIDENTIAL,
            _ => {
                return Err(ServiceError::ValidationError(format!(
                    "Invalid client_type: {}. Must be PUBLIC or CONFIDENTIAL",
                    request.client_type
                )))
            }
        };

        let id = Uuid::new_v4().to_string();
        let client_id = Uuid::new_v4().to_string();

        let (client_secret_hash, plain_secret) = if client_type_enum == ClientType::CONFIDENTIAL {
            let secret = Uuid::new_v4().to_string();
            let hash = crypto::hash_password(&secret)?;
            (Some(hash), secret)
        } else {
            (None, String::new())
        };

        let now = Utc::now();
        let client_type_str = client_type_enum.to_string();

        let mut tx = self.db.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO oauth_clients (
                id, client_id, client_secret, name, client_type,
                is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&client_id)
        .bind(&client_secret_hash)
        .bind(&request.name)
        .bind(&client_type_str)
        .bind(true) // is_active
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        for uri in &request.redirect_uris {
            sqlx::query(
                "INSERT INTO client_redirect_uris (client_id, uri) VALUES (?, ?)",
            )
            .bind(&id)
            .bind(uri)
            .execute(&mut *tx)
            .await?;
        }

        for grant in &request.grant_types {
            sqlx::query(
                "INSERT INTO client_grant_types (client_id, grant_type) VALUES (?, ?)",
            )
            .bind(&id)
            .bind(grant)
            .execute(&mut *tx)
            .await?;
        }

        for res_type in &request.response_types {
            sqlx::query(
                "INSERT INTO client_response_types (client_id, response_type) VALUES (?, ?)",
            )
            .bind(&id)
            .bind(res_type)
            .execute(&mut *tx)
            .await?;
        }

        for scope in &request.allowed_scopes {
            sqlx::query(
                "INSERT INTO client_allowed_scopes (client_id, scope) VALUES (?, ?)",
            )
            .bind(&id)
            .bind(scope)
            .execute(&mut *tx)
            .await?;
        }

        if let Some(permissions) = &request.client_permissions {
            for perm in permissions {
                sqlx::query(
                    "INSERT INTO client_permissions (client_id, permission) VALUES (?, ?)",
                )
                .bind(&id)
                .bind(perm)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;

        let client_details = self.find_by_client_id(&client_id).await?.ok_or_else(|| {
            ServiceError::Internal("Failed to retrieve created client".to_string())
        })?;

        Ok((client_details, plain_secret))
    }

    async fn list_clients(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<OAuthClientDetails>, ServiceError> {
        let limit = limit.unwrap_or(50).min(100);
        let offset = offset.unwrap_or(0);

        let clients = sqlx::query_as::<_, OAuthClient>(
            "SELECT * FROM oauth_clients ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&*self.db)
        .await?;

        // Optimize: Parallelize client detail fetches using futures::join_all
        // This reduces I/O latency from sequential client fetches to concurrent requests
        let client_ids: Vec<String> = clients
            .into_iter()
            .map(|client| client.client_id)
            .collect();

        let futures = client_ids
            .iter()
            .map(|id| self.find_by_client_id(id));

        let results = futures::future::join_all(futures).await;

        let detailed_clients = results
            .into_iter()
            .filter_map(|result| result.ok().flatten())
            .collect();

        Ok(detailed_clients)
    }

    async fn update_client(
        &self,
        client_id: &str,
        name: Option<String>,
        redirect_uris: Option<Vec<String>>,
        allowed_scopes: Option<Vec<String>>,
        is_active: Option<bool>,
    ) -> Result<OAuthClientDetails, ServiceError> {
        let mut tx = self.db.begin().await?;

        let existing_client = sqlx::query_as::<_, OAuthClient>(
            "SELECT * FROM oauth_clients WHERE client_id = ? FOR UPDATE",
        )
        .bind(client_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| ServiceError::NotFound(format!("Client '{client_id}' not found")))?;

        let new_name = name.unwrap_or(existing_client.name.clone());
        let new_is_active = is_active.unwrap_or(existing_client.is_active);
        let now = Utc::now();

        sqlx::query(
            "UPDATE oauth_clients SET name = ?, is_active = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&new_name)
        .bind(&new_is_active)
        .bind(&now)
        .bind(&existing_client.id)
        .execute(&mut *tx)
        .await?;

        if let Some(uris) = redirect_uris {
            sqlx::query(
                "DELETE FROM client_redirect_uris WHERE client_id = ?",
            )
            .bind(&existing_client.id)
            .execute(&mut *tx)
            .await?;
            for uri in &uris {
                sqlx::query(
                    "INSERT INTO client_redirect_uris (client_id, uri) VALUES (?, ?)",
                )
                .bind(&existing_client.id)
                .bind(uri)
                .execute(&mut *tx)
                .await?;
            }
        }

        if let Some(scopes) = allowed_scopes {
            sqlx::query(
                "DELETE FROM client_allowed_scopes WHERE client_id = ?",
            )
            .bind(&existing_client.id)
            .execute(&mut *tx)
            .await?;
            for scope in &scopes {
                sqlx::query(
                    "INSERT INTO client_allowed_scopes (client_id, scope) VALUES (?, ?)",
                )
                .bind(&existing_client.id)
                .bind(scope)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;

        self.find_by_client_id(client_id)
            .await?
            .ok_or_else(|| ServiceError::Internal("Failed to retrieve updated client".to_string()))
    }

    async fn delete_client(&self, client_id: &str) -> Result<(), ServiceError> {
        let client = self
            .find_by_client_id(client_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Client '{client_id}' not found")))?;

        let now = Utc::now();
        sqlx::query(
            "UPDATE oauth_clients SET is_active = ?, updated_at = ? WHERE id = ?",
        )
        .bind(false)
        .bind(&now)
        .bind(&client.client.id)
        .execute(&*self.db)
        .await?;

        Ok(())
    }

    async fn get_internal_client(&self) -> Result<OAuthClientDetails, ServiceError> {
        self.find_by_client_id("admin-portal-client")
            .await?
            .ok_or_else(|| {
                ServiceError::NotFound(
                    "Internal client 'admin-portal-client' not found".to_string(),
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::clients::CreateClientRequest;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        pool
    }

    #[tokio::test]
    async fn test_create_public_client() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Test Public Client".to_string(),
            client_type: "PUBLIC".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string(), "write".to_string()],
            client_permissions: None,
        };

        let result = service.create_client(request).await;

        assert!(result.is_ok());
        let (client_details, secret) = result.unwrap();
        assert_eq!(client_details.client.name, "Test Public Client");
        assert_eq!(client_details.client.client_type, ClientType::PUBLIC);
        assert!(client_details.client.client_secret.is_none());
        assert_eq!(secret, "");
        assert!(client_details.client.is_active);
        assert_eq!(
            client_details.redirect_uris,
            vec!["http://localhost:3000/callback"]
        );
    }

    #[tokio::test]
    async fn test_create_confidential_client() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Test Confidential Client".to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            redirect_uris: vec!["https://example.com/callback".to_string()],
            grant_types: vec![
                "authorization_code".to_string(),
                "refresh_token".to_string(),
            ],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let result = service.create_client(request).await;

        assert!(result.is_ok());
        let (client_details, secret) = result.unwrap();
        assert_eq!(client_details.client.name, "Test Confidential Client");
        assert_eq!(client_details.client.client_type, ClientType::CONFIDENTIAL);
        assert!(client_details.client.client_secret.is_some());
        assert!(!secret.is_empty());
    }

    #[tokio::test]
    async fn test_create_client_invalid_type() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Test Client".to_string(),
            client_type: "INVALID".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let result = service.create_client(request).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::ValidationError(msg) => {
                assert!(msg.contains("Invalid client_type"));
            }
            _ => panic!("Expected ValidationError"),
        }
    }

    #[tokio::test]
    async fn test_find_by_client_id() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Test Client".to_string(),
            client_type: "PUBLIC".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let (client_details, _) = service.create_client(request).await.unwrap();

        let found = service
            .find_by_client_id(&client_details.client.client_id)
            .await
            .unwrap();
        assert!(found.is_some());
        let found_client = found.unwrap();
        assert_eq!(
            found_client.client.client_id,
            client_details.client.client_id
        );
        assert_eq!(found_client.client.name, "Test Client");
        assert_eq!(
            found_client.redirect_uris,
            vec!["http://localhost:3000/callback"]
        );

        let not_found = service.find_by_client_id("nonexistent").await.unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_authenticate_public_client() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Public Client".to_string(),
            client_type: "PUBLIC".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let (client_details, _) = service.create_client(request).await.unwrap();

        let result = service
            .authenticate_client(&client_details.client.client_id, None)
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_authenticate_confidential_client_success() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Confidential Client".to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            redirect_uris: vec!["https://example.com/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let (client_details, secret) = service.create_client(request).await.unwrap();

        let result = service
            .authenticate_client(&client_details.client.client_id, Some(&secret))
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_authenticate_confidential_client_wrong_secret() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Confidential Client".to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            redirect_uris: vec!["https://example.com/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let (client_details, _) = service.create_client(request).await.unwrap();

        let result = service
            .authenticate_client(&client_details.client.client_id, Some("wrong_secret"))
            .await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(msg) => {
                assert!(msg.contains("Invalid client secret"));
            }
            _ => panic!("Expected Unauthorized error"),
        }
    }

    #[tokio::test]
    async fn test_authenticate_confidential_client_no_secret() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let request = CreateClientRequest {
            name: "Confidential Client".to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            redirect_uris: vec!["https://example.com/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            response_types: vec!["code".to_string()],
            allowed_scopes: vec!["read".to_string()],
            client_permissions: None,
        };

        let (client_details, _) = service.create_client(request).await.unwrap();

        let result = service
            .authenticate_client(&client_details.client.client_id, None)
            .await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(msg) => {
                assert!(msg.contains("Client secret required"));
            }
            _ => panic!("Expected Unauthorized error"),
        }
    }

    #[tokio::test]
    async fn test_authenticate_nonexistent_client() {
        let db = Arc::new(setup_test_db().await);
        let service = ClientServiceImpl::new(db);

        let result = service
            .authenticate_client("nonexistent_client_id", None)
            .await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::NotFound(_) => {}
            _ => panic!("Expected NotFound error"),
        }
    }
}
