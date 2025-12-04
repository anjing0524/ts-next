// 客户端管理 API
use crate::{
    error::{AppError, ServiceError},
    middleware::auth::AuthContext,
    models::client::OAuthClientDetails,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize, Debug)]
pub struct CreateClientRequest {
    pub name: String,
    pub client_type: String,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub response_types: Vec<String>,
    pub allowed_scopes: Vec<String>,
    pub client_permissions: Option<Vec<String>>,
}

#[derive(Deserialize, Debug)]
pub struct ListClientsQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateClientRequest {
    pub name: Option<String>,
    pub redirect_uris: Option<Vec<String>>,
    pub allowed_scopes: Option<Vec<String>>,
    pub is_active: Option<bool>,
}

#[derive(Serialize, Debug)]
pub struct ClientResponse {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub client_type: crate::models::client::ClientType,
    pub is_active: bool,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub allowed_scopes: Vec<String>,
}

#[derive(Serialize)]
pub struct ClientWithSecretResponse {
    #[serde(flatten)]
    pub client: ClientResponse,
    pub client_secret: String,
}

impl From<OAuthClientDetails> for ClientResponse {
    fn from(details: OAuthClientDetails) -> Self {
        Self {
            id: details.client.id,
            client_id: details.client.client_id,
            name: details.client.name,
            client_type: details.client.client_type,
            is_active: details.client.is_active,
            redirect_uris: details.redirect_uris,
            grant_types: details.grant_types,
            allowed_scopes: details.allowed_scopes,
        }
    }
}

pub async fn list_clients(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListClientsQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<Vec<ClientResponse>>, AppError> {
    let clients = state
        .client_service
        .list_clients(query.limit, query.offset)
        .await?;

    let response: Vec<ClientResponse> = clients.into_iter().map(Into::into).collect();

    Ok(Json(response))
}

pub async fn create_client(
    State(state): State<Arc<AppState>>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<CreateClientRequest>,
) -> Result<Json<ClientWithSecretResponse>, AppError> {
    if payload.name.trim().is_empty() {
        return Err(ServiceError::ValidationError("Client name is required".to_string()).into());
    }

    let (client_details, plain_secret) = state.client_service.create_client(payload).await?;

    Ok(Json(ClientWithSecretResponse {
        client: client_details.into(),
        client_secret: plain_secret,
    }))
}

pub async fn get_client(
    State(state): State<Arc<AppState>>,
    Path(client_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<ClientResponse>, AppError> {
    let client = state
        .client_service
        .find_by_client_id(&client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Client not found".to_string()))?;

    Ok(Json(client.into()))
}

pub async fn update_client(
    State(state): State<Arc<AppState>>,
    Path(client_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<UpdateClientRequest>,
) -> Result<Json<ClientResponse>, AppError> {
    let updated_client = state
        .client_service
        .update_client(
            &client_id,
            payload.name,
            payload.redirect_uris,
            payload.allowed_scopes,
            payload.is_active,
        )
        .await?;

    Ok(Json(updated_client.into()))
}

pub async fn delete_client(
    State(state): State<Arc<AppState>>,
    Path(client_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.client_service.delete_client(&client_id).await?;

    Ok(Json(serde_json::json!({
        "message": "Client deleted successfully",
        "client_id": client_id
    })))
}
