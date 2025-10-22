use serde::Deserialize;
use jsonwebtoken::{EncodingKey, DecodingKey};
use crate::error::ServiceError;

/// JWT签名算法配置
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
#[derive(Default)]
pub enum JwtAlgorithm {
    /// HMAC with SHA-256 (使用共享密钥)
    #[default]
    HS256,
    /// RSA with SHA-256 (使用公钥/私钥对)
    RS256,
}


impl JwtAlgorithm {
    pub fn as_str(&self) -> &'static str {
        match self {
            JwtAlgorithm::HS256 => "HS256",
            JwtAlgorithm::RS256 => "RS256",
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_private_key_path: String,
    pub jwt_public_key_path: String,
    pub issuer: String,
    /// JWT签名算法，默认为HS256。可配置为RS256用于生产环境
    #[serde(default)]
    pub jwt_algorithm: JwtAlgorithm,
}

impl Config {
    /// 从配置文件路径加载JWT编码密钥
    /// 支持RS256 (PEM格式) 和 HS256 (密钥文件)
    pub fn load_encoding_key(&self) -> Result<EncodingKey, ServiceError> {
        match self.jwt_algorithm {
            JwtAlgorithm::RS256 => {
                // RS256: 从PEM文件读取私钥
                let key_data = std::fs::read(&self.jwt_private_key_path)
                    .map_err(|e| ServiceError::Unauthorized(
                        format!("Failed to read JWT private key file: {e}")
                    ))?;

                EncodingKey::from_rsa_pem(&key_data)
                    .map_err(|e| ServiceError::Unauthorized(
                        format!("Failed to parse RSA private key: {e}")
                    ))
            }
            JwtAlgorithm::HS256 => {
                // HS256: 从文件读取密钥或使用环境变量
                // NOTE: NO hardcoded fallback for security reasons
                let key_data = if !self.jwt_private_key_path.is_empty() {
                    // 尝试从文件读取
                    std::fs::read_to_string(&self.jwt_private_key_path)
                        .map_err(|e| ServiceError::Unauthorized(
                            format!("Failed to read JWT secret file '{}': {}",
                                   self.jwt_private_key_path, e)
                        ))?
                } else {
                    // 路径为空，使用环境变量
                    std::env::var("JWT_SECRET")
                        .map_err(|_| ServiceError::Unauthorized(
                            "JWT_SECRET environment variable must be set for HS256 algorithm".to_string()
                        ))?
                };

                Ok(EncodingKey::from_secret(key_data.as_bytes()))
            }
        }
    }

    /// 从配置文件路径加载JWT解码密钥
    pub fn load_decoding_key(&self) -> Result<DecodingKey, ServiceError> {
        match self.jwt_algorithm {
            JwtAlgorithm::RS256 => {
                // RS256: 从PEM文件读取公钥
                let key_data = std::fs::read(&self.jwt_public_key_path)
                    .map_err(|e| ServiceError::Unauthorized(
                        format!("Failed to read JWT public key file: {e}")
                    ))?;

                DecodingKey::from_rsa_pem(&key_data)
                    .map_err(|e| ServiceError::Unauthorized(
                        format!("Failed to parse RSA public key: {e}")
                    ))
            }
            JwtAlgorithm::HS256 => {
                // HS256: 使用相同的密钥
                // NOTE: NO hardcoded fallback for security reasons
                let key_data = if !self.jwt_private_key_path.is_empty() {
                    std::fs::read_to_string(&self.jwt_private_key_path)
                        .map_err(|e| ServiceError::Unauthorized(
                            format!("Failed to read JWT secret file '{}': {}",
                                   self.jwt_private_key_path, e)
                        ))?
                } else {
                    // 路径为空，使用环境变量
                    std::env::var("JWT_SECRET")
                        .map_err(|_| ServiceError::Unauthorized(
                            "JWT_SECRET environment variable must be set for HS256 algorithm".to_string()
                        ))?
                };

                Ok(DecodingKey::from_secret(key_data.as_bytes()))
            }
        }
    }
}

impl Config {
    /// Loads configuration.
    ///
    /// This function specifically reads the DATABASE_URL from the local .env file
    /// to bypass any shell environment variables that may be set.
    /// Other variables are read from the environment as usual.
    pub fn from_env() -> Result<Self, anyhow::Error> {
        // Read the content of the local .env file
        let env_content = std::fs::read_to_string("./.env")
            .map_err(|e| anyhow::anyhow!("Failed to read .env file: {e}"))?;

        // Manually parse the content to get the DATABASE_URL
        let env_map = dotenv_parser::parse_dotenv(&env_content)
            .map_err(|e| anyhow::anyhow!("Failed to parse .env content: {e}"))?;

        let database_url = env_map
            .get("DATABASE_URL")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("DATABASE_URL must be set in .env file"))?;

        // Load other variables from the environment (which might be set by a .env file higher up or by the shell)
        dotenvy::dotenv().ok();

        let jwt_private_key_path = std::env::var("JWT_PRIVATE_KEY_PATH")
            .map_err(|_| anyhow::anyhow!("JWT_PRIVATE_KEY_PATH must be set"))?;

        let jwt_public_key_path = std::env::var("JWT_PUBLIC_KEY_PATH")
            .map_err(|_| anyhow::anyhow!("JWT_PUBLIC_KEY_PATH must be set"))?;

        let issuer =
            std::env::var("ISSUER").unwrap_or_else(|_| "http://127.0.0.1:3001".to_string());

        let jwt_algorithm = std::env::var("JWT_ALGORITHM")
            .ok()
            .and_then(|s| match s.to_uppercase().as_str() {
                "RS256" => Some(JwtAlgorithm::RS256),
                "HS256" => Some(JwtAlgorithm::HS256),
                _ => None,
            })
            .unwrap_or_default();

        Ok(Self {
            database_url,
            jwt_private_key_path,
            jwt_public_key_path,
            issuer,
            jwt_algorithm,
        })
    }
}
