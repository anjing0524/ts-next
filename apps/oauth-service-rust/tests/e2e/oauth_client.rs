//! OAuth test client
//!
//! High-level HTTP client for testing OAuth 2.1 flows.

use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::pkce::PkceChallenge;

/// OAuth test client for making API requests
pub struct OAuthTestClient {
    pub http_client: Client,
    pub base_url: String,
}

/// Authorization request parameters
#[derive(Debug, Serialize)]
pub struct AuthorizeRequest {
    pub response_type: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub scope: String,
    pub state: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
}

/// Token request for authorization code exchange
#[derive(Debug, Serialize)]
pub struct TokenRequest {
    pub grant_type: String,
    pub code: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub code_verifier: String,
}

/// Refresh token request
#[derive(Debug, Serialize)]
pub struct RefreshTokenRequest {
    pub grant_type: String,
    pub refresh_token: String,
    pub client_id: String,
    pub client_secret: Option<String>,
}

/// Client credentials request
#[derive(Debug, Serialize)]
pub struct ClientCredentialsRequest {
    pub grant_type: String,
    pub client_id: String,
    pub client_secret: String,
    pub scope: Option<String>,
}

/// Token revocation request
#[derive(Debug, Serialize)]
pub struct RevokeRequest {
    pub token: String,
    pub token_type_hint: Option<String>,
    pub client_id: String,
    pub client_secret: Option<String>,
}

/// Token response
#[derive(Debug, Deserialize, Clone)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
}

/// OAuth error response
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub error_description: Option<String>,
}

impl OAuthTestClient {
    /// Create a new OAuth test client
    pub fn new(base_url: String) -> Self {
        let http_client = Client::builder()
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::none()) // Don't auto-follow redirects
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http_client,
            base_url,
        }
    }

    /// Initiate authorization code flow
    ///
    /// Returns the redirect location header if successful
    pub async fn authorize(
        &self,
        client_id: &str,
        redirect_uri: &str,
        scope: &str,
        pkce: &PkceChallenge,
    ) -> Result<String, String> {
        let state = uuid::Uuid::new_v4().to_string();

        let params = AuthorizeRequest {
            response_type: "code".to_string(),
            client_id: client_id.to_string(),
            redirect_uri: redirect_uri.to_string(),
            scope: scope.to_string(),
            state: state.clone(),
            code_challenge: pkce.code_challenge.clone(),
            code_challenge_method: pkce.code_challenge_method.clone(),
        };

        let url = format!("{}/api/v2/oauth/authorize", self.base_url);
        let response = self
            .http_client
            .get(&url)
            .query(&params)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        // For now, we expect a redirect or success
        if response.status().is_redirection() {
            response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .ok_or_else(|| "No location header in redirect".to_string())
        } else if response.status().is_success() {
            Ok("Success".to_string())
        } else {
            Err(format!("Unexpected status: {}", response.status()))
        }
    }

    /// Exchange authorization code for tokens
    pub async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        client_id: &str,
        client_secret: Option<&str>,
        code_verifier: &str,
    ) -> Result<TokenResponse, ErrorResponse> {
        let request = TokenRequest {
            grant_type: "authorization_code".to_string(),
            code: code.to_string(),
            redirect_uri: redirect_uri.to_string(),
            client_id: client_id.to_string(),
            client_secret: client_secret.map(|s| s.to_string()),
            code_verifier: code_verifier.to_string(),
        };

        let url = format!("{}/api/v2/oauth/token", self.base_url);
        let response = self
            .http_client
            .post(&url)
            .form(&request)
            .send()
            .await
            .expect("Failed to send token request");

        if response.status().is_success() {
            Ok(response.json::<TokenResponse>().await.expect("Failed to parse token response"))
        } else {
            Err(response.json::<ErrorResponse>().await.expect("Failed to parse error response"))
        }
    }

    /// Refresh an access token
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
        client_id: &str,
        client_secret: Option<&str>,
    ) -> Result<TokenResponse, ErrorResponse> {
        let request = RefreshTokenRequest {
            grant_type: "refresh_token".to_string(),
            refresh_token: refresh_token.to_string(),
            client_id: client_id.to_string(),
            client_secret: client_secret.map(|s| s.to_string()),
        };

        let url = format!("{}/api/v2/oauth/token", self.base_url);
        let response = self
            .http_client
            .post(&url)
            .form(&request)
            .send()
            .await
            .expect("Failed to send refresh token request");

        if response.status().is_success() {
            Ok(response.json::<TokenResponse>().await.expect("Failed to parse token response"))
        } else {
            Err(response.json::<ErrorResponse>().await.expect("Failed to parse error response"))
        }
    }

    /// Client credentials grant
    pub async fn client_credentials(
        &self,
        client_id: &str,
        client_secret: &str,
        scope: Option<&str>,
    ) -> Result<TokenResponse, ErrorResponse> {
        let request = ClientCredentialsRequest {
            grant_type: "client_credentials".to_string(),
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            scope: scope.map(|s| s.to_string()),
        };

        let url = format!("{}/api/v2/oauth/token", self.base_url);
        let response = self
            .http_client
            .post(&url)
            .form(&request)
            .send()
            .await
            .expect("Failed to send client credentials request");

        if response.status().is_success() {
            Ok(response.json::<TokenResponse>().await.expect("Failed to parse token response"))
        } else {
            Err(response.json::<ErrorResponse>().await.expect("Failed to parse error response"))
        }
    }

    /// Revoke a token
    pub async fn revoke_token(
        &self,
        token: &str,
        token_type_hint: Option<&str>,
        client_id: &str,
        client_secret: Option<&str>,
    ) -> Result<(), ErrorResponse> {
        let request = RevokeRequest {
            token: token.to_string(),
            token_type_hint: token_type_hint.map(|s| s.to_string()),
            client_id: client_id.to_string(),
            client_secret: client_secret.map(|s| s.to_string()),
        };

        let url = format!("{}/api/v2/oauth/revoke", self.base_url);
        let response = self
            .http_client
            .post(&url)
            .form(&request)
            .send()
            .await
            .expect("Failed to send revoke request");

        if response.status().is_success() {
            Ok(())
        } else {
            Err(response.json::<ErrorResponse>().await.expect("Failed to parse error response"))
        }
    }

    /// Make an authenticated API request
    pub async fn get_with_token(&self, path: &str, access_token: &str) -> Response {
        let url = format!("{}{}", self.base_url, path);
        self.http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .expect("Failed to send authenticated request")
    }

    /// POST with access token
    pub async fn post_with_token(&self, path: &str, access_token: &str, body: &impl Serialize) -> Response {
        let url = format!("{}{}", self.base_url, path);
        self.http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .json(body)
            .send()
            .await
            .expect("Failed to send authenticated POST request")
    }

    /// Make unauthenticated GET request
    pub async fn get(&self, path: &str) -> Response {
        let url = format!("{}{}", self.base_url, path);
        self.http_client
            .get(&url)
            .send()
            .await
            .expect("Failed to send GET request")
    }

    /// Make unauthenticated POST request
    pub async fn post(&self, path: &str, body: &impl Serialize) -> Response {
        let url = format!("{}{}", self.base_url, path);
        self.http_client
            .post(&url)
            .json(body)
            .send()
            .await
            .expect("Failed to send POST request")
    }

    /// Introspect a token
    pub async fn introspect_token(
        &self,
        token: &str,
        client_id: &str,
        client_secret: Option<&str>,
    ) -> Response {
        let url = format!("{}/api/v2/oauth/introspect", self.base_url);

        let mut form = HashMap::new();
        form.insert("token", token);
        form.insert("client_id", client_id);
        if let Some(secret) = client_secret {
            form.insert("client_secret", secret);
        }

        self.http_client
            .post(&url)
            .form(&form)
            .send()
            .await
            .expect("Failed to send introspect request")
    }

    /// Get UserInfo
    pub async fn get_userinfo(&self, access_token: &str) -> Response {
        self.get_with_token("/api/v2/oauth/userinfo", access_token).await
    }
}
