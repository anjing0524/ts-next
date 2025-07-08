//! JWT 验证模块

use jsonwebtoken::{decode, decode_header, jwk, DecodingKey, Validation};
use lru::LruCache;
use serde::Deserialize;
use std::num::NonZeroUsize;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, error, warn};

#[derive(Error, Debug)]
pub enum JwtError {
    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("JWKS中未找到匹配的Key ID (kid)")]
    KidNotFound,
    #[error("Token中缺少Key ID (kid)")]
    KidMissingInToken,
}

/// JWT claims (我们只关心标准字段，所以不需要自定义结构)
type Claims = serde_json::Value;

/// JWK Set (JWKS)
#[derive(Debug, Deserialize, Clone)]
struct JwkSet {
    keys: Vec<jwk::Jwk>,
}

#[derive(Clone)]
pub struct JwtValidator {
    jwks_url: String,
    audience: String,
    issuer: String,
    key_cache: Arc<RwLock<LruCache<String, DecodingKey>>>,
}

impl JwtValidator {
    pub fn new(jwks_url: String, audience: String, issuer: String, cache_size: usize) -> Self {
        let size = NonZeroUsize::new(cache_size).unwrap_or(NonZeroUsize::new(100).unwrap());
        Self {
            jwks_url,
            audience,
            issuer,
            key_cache: Arc::new(RwLock::new(LruCache::new(size))),
        }
    }

    pub async fn validate(&self, token: &str) -> Result<(), JwtError> {
        let header = decode_header(token)?;
        let kid = header.kid.ok_or(JwtError::KidMissingInToken)?;

        // 尝试从缓存获取key
        if let Some(key) = self.key_cache.read().await.peek(&kid) {
            debug!("从缓存中获取KID: {}", kid);
            return self.decode_token(token, key);
        }

        // 如果缓存中没有，则获取所有key并更新缓存
        debug!("缓存未命中，从JWKS URL获取所有Keys");
        self.fetch_and_cache_keys().await?;

        // 再次尝试从缓存获取
        if let Some(key) = self.key_cache.read().await.peek(&kid) {
            debug!("获取并缓存后，从缓存中获取KID: {}", kid);
            return self.decode_token(token, key);
        }

        // 如果刷新后仍然找不到，则返回错误
        error!("即使在刷新JWKS之后，也找不到KID: {}", kid);
        Err(JwtError::KidNotFound)
    }

    async fn fetch_and_cache_keys(&self) -> Result<(), reqwest::Error> {
        let jwks: JwkSet = reqwest::get(&self.jwks_url).await?.json().await?;
        let mut cache = self.key_cache.write().await;
        cache.clear(); // 清除旧的keys
        for jwk in jwks.keys {
            if let Some(kid) = &jwk.common.key_id {
                match DecodingKey::from_jwk(&jwk) {
                    Ok(key) => {
                        cache.put(kid.clone(), key);
                    }
                    Err(e) => {
                        warn!("从JWK创建DecodingKey失败, kid: {}, error: {}", kid, e);
                    }
                }
            }
        }
        debug!("JWKS缓存已更新，共缓存了 {} 个keys", cache.len());
        Ok(())
    }

    fn decode_token(&self, token: &str, key: &DecodingKey) -> Result<(), JwtError> {
        let mut validation = Validation::new(jsonwebtoken::Algorithm::RS256);
        validation.set_audience(&[self.audience.clone()]);
        validation.set_issuer(&[self.issuer.clone()]);
        validation.validate_exp = true;

        decode::<Claims>(token, key, &validation)?;
        debug!("Token验证成功");
        Ok(())
    }
}
