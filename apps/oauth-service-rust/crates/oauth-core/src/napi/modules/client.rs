use crate::napi::error::SDKResult;
use crate::napi::http_client::HttpClient;
use crate::napi::modules::rbac::PaginatedResponse;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// 客户端信息 ClientInfo 结构（包含敏感字段，仅内部使用）
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

/// 客户端信息（公开版本，去除敏感字段）- 用于 NAPI/前端
#[derive(Debug, Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct ClientInfoPublic {
    pub client_id: String,
    pub client_name: String,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 客户端列表响应（公开版本）- 用于 NAPI
#[derive(Debug, Serialize, Deserialize)]
pub struct ClientListResponsePublic {
    pub items: Vec<ClientInfoPublic>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub has_more: bool,
}

/// 创建客户端请求 CreateClientRequest 结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateClientRequest {
    pub client_name: String,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
}

/// 客户端模块 ClientModule
#[derive(Debug)]
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
        let path = format!("/api/v2/client/clients?page={p}&page_size={ps}");
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<ClientInfo>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 获取单个客户端 get_client
    /// GET /api/v2/client/clients/{client_id}
    pub async fn get_client(&self, client_id: String) -> SDKResult<ClientInfo> {
        let path = format!("/api/v2/client/clients/{client_id}");
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 创建客户端 create_client
    /// POST /api/v2/client/clients
    pub async fn create_client(&self, client: CreateClientRequest) -> SDKResult<ClientInfo> {
        let body = serde_json::to_value(&client)?;
        let response = self
            .http_client
            .post("/api/v2/client/clients", body)
            .await?;
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
        let path = format!("/api/v2/client/clients/{client_id}");
        let response = self.http_client.put(&path, body).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 删除客户端 delete_client
    /// DELETE /api/v2/client/clients/{client_id}
    pub async fn delete_client(&self, client_id: String) -> SDKResult<bool> {
        let path = format!("/api/v2/client/clients/{client_id}");
        let response = self.http_client.delete(&path).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| {
                crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field")
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_info_serialization() {
        // 验证 ClientInfo 序列化 - Verifies ClientInfo serialization
        let client = ClientInfo {
            client_id: "client123".to_string(),
            client_name: "Test Client".to_string(),
            client_secret: Some("secret123".to_string()),
            redirect_uris: vec![
                "https://example.com/callback".to_string(),
                "https://app.example.com/oauth".to_string(),
            ],
            grant_types: vec![
                "authorization_code".to_string(),
                "refresh_token".to_string(),
            ],
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-02T00:00:00Z".to_string(),
        };

        let json = serde_json::to_value(&client).unwrap();

        assert!(json.get("client_id").is_some());
        assert!(json.get("client_name").is_some());
        assert!(json.get("redirect_uris").is_some());
        assert!(json.get("grant_types").is_some());

        // 验证数组 - Verify arrays
        assert!(json["redirect_uris"].is_array());
        assert!(json["grant_types"].is_array());
        assert_eq!(json["redirect_uris"].as_array().unwrap().len(), 2);
        assert_eq!(json["grant_types"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_create_client_request_serialization() {
        // 验证 CreateClientRequest 序列化 - Verifies CreateClientRequest serialization
        let req = CreateClientRequest {
            client_name: "New Test Client".to_string(),
            redirect_uris: vec!["https://newapp.example.com/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
        };

        let json = serde_json::to_value(&req).unwrap();

        assert!(json.get("client_name").is_some());
        assert!(json.get("redirect_uris").is_some());
        assert!(json.get("grant_types").is_some());

        // 验证字段数量 - Verify field count
        assert_eq!(json.as_object().unwrap().len(), 3);
    }

    #[test]
    fn test_client_arrays() {
        // 验证 ClientInfo 数组字段 - Verifies ClientInfo array fields
        let client = ClientInfo {
            client_id: "c1".to_string(),
            client_name: "Test".to_string(),
            client_secret: None,
            redirect_uris: vec![
                "http://localhost:3000".to_string(),
                "http://localhost:4000".to_string(),
                "http://localhost:5000".to_string(),
            ],
            grant_types: vec![
                "authorization_code".to_string(),
                "refresh_token".to_string(),
                "client_credentials".to_string(),
            ],
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_value(&client).unwrap();

        let uris = json["redirect_uris"].as_array().unwrap();
        assert_eq!(uris.len(), 3);
        assert_eq!(uris[0], "http://localhost:3000");

        let types = json["grant_types"].as_array().unwrap();
        assert_eq!(types.len(), 3);
        assert_eq!(types[1], "refresh_token");
    }
}
