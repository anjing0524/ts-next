use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::rbac::PaginatedResponse;
use serde::{Deserialize, Serialize};

/// 客户端信息 ClientInfo 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClientInfo {
    pub client_id: String,
    pub client_name: String,
    pub client_secret: Option<String>,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建客户端请求 CreateClientRequest 结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateClientRequest {
    pub client_name: String,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
}

/// 客户端模块 ClientModule
pub struct ClientModule {
    http_client: HttpClient,
}

impl ClientModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    /// 获取客户端列表 list_clients
    /// GET /api/v2/client/clients
    pub async fn list_clients(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<ClientInfo>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/client/clients?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<ClientInfo>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 获取单个客户端 get_client
    /// GET /api/v2/client/clients/{client_id}
    pub async fn get_client(&self, client_id: String) -> SDKResult<ClientInfo> {
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 创建客户端 create_client
    /// POST /api/v2/client/clients
    pub async fn create_client(&self, client: CreateClientRequest) -> SDKResult<ClientInfo> {
        let body = serde_json::to_value(&client)?;
        let response = self.http_client.post("/api/v2/client/clients", body).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 更新客户端 update_client
    /// PUT /api/v2/client/clients/{client_id}
    pub async fn update_client(
        &self,
        client_id: String,
        client: CreateClientRequest,
    ) -> SDKResult<ClientInfo> {
        let body = serde_json::to_value(&client)?;
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.put(&path, body).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 删除客户端 delete_client
    /// DELETE /api/v2/client/clients/{client_id}
    pub async fn delete_client(&self, client_id: String) -> SDKResult<bool> {
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.delete(&path).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }
}
