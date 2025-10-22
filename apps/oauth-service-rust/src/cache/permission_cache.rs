//! Permission cache implementation
//!
//! Provides caching for user permissions to reduce database queries.
//! Uses in-memory cache with configurable TTL.
//!
//! Production systems should extend this to use Redis for distributed caching.

use super::CacheError;
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Cached permission entry with TTL
#[derive(Clone, Debug)]
struct CacheEntry {
    permissions: Vec<String>,
    created_at: DateTime<Utc>,
    ttl_seconds: i64,
}

impl CacheEntry {
    fn is_expired(&self) -> bool {
        let age = Utc::now() - self.created_at;
        age > Duration::seconds(self.ttl_seconds)
    }
}

/// Permission cache trait for abstraction
#[async_trait]
pub trait PermissionCache: Send + Sync {
    /// Get cached permissions for a user
    async fn get(&self, user_id: &str) -> Option<Vec<String>>;

    /// Set permissions for a user with TTL
    async fn set(
        &self,
        user_id: &str,
        permissions: Vec<String>,
        ttl_seconds: i64,
    ) -> Result<(), CacheError>;

    /// Invalidate cache for a user (used after permission updates)
    async fn invalidate(&self, user_id: &str) -> Result<(), CacheError>;

    /// Clear entire cache
    async fn clear(&self) -> Result<(), CacheError>;

    /// Get cache statistics for monitoring
    async fn stats(&self) -> CacheStats;
}

/// Cache statistics for monitoring
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub total_entries: usize,
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
}

/// In-memory permission cache
///
/// This is a simple in-memory implementation suitable for development
/// and single-instance deployments. For distributed systems, implement
/// a Redis-backed version.
pub struct InMemoryPermissionCache {
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    hits: Arc<RwLock<u64>>,
    misses: Arc<RwLock<u64>>,
}

impl InMemoryPermissionCache {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            hits: Arc::new(RwLock::new(0)),
            misses: Arc::new(RwLock::new(0)),
        }
    }

    /// Create a new cache with specified capacity hint
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::with_capacity(capacity))),
            hits: Arc::new(RwLock::new(0)),
            misses: Arc::new(RwLock::new(0)),
        }
    }
}

impl Default for InMemoryPermissionCache {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl PermissionCache for InMemoryPermissionCache {
    async fn get(&self, user_id: &str) -> Option<Vec<String>> {
        let mut cache = self.cache.write().await;

        if let Some(entry) = cache.get(user_id) {
            if entry.is_expired() {
                // Remove expired entry
                cache.remove(user_id);
                *self.misses.write().await += 1;
                return None;
            }

            *self.hits.write().await += 1;
            return Some(entry.permissions.clone());
        }

        *self.misses.write().await += 1;
        None
    }

    async fn set(
        &self,
        user_id: &str,
        permissions: Vec<String>,
        ttl_seconds: i64,
    ) -> Result<(), CacheError> {
        let entry = CacheEntry {
            permissions,
            created_at: Utc::now(),
            ttl_seconds,
        };

        let mut cache = self.cache.write().await;
        cache.insert(user_id.to_string(), entry);

        Ok(())
    }

    async fn invalidate(&self, user_id: &str) -> Result<(), CacheError> {
        let mut cache = self.cache.write().await;
        cache.remove(user_id);
        Ok(())
    }

    async fn clear(&self) -> Result<(), CacheError> {
        let mut cache = self.cache.write().await;
        cache.clear();
        Ok(())
    }

    async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let hits = *self.hits.read().await;
        let misses = *self.misses.read().await;
        let total = hits + misses;
        let hit_rate = if total > 0 {
            (hits as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        CacheStats {
            total_entries: cache.len(),
            hits,
            misses,
            hit_rate,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_set_and_get() {
        let cache = InMemoryPermissionCache::new();
        let perms = vec!["read".to_string(), "write".to_string()];

        cache.set("user1", perms.clone(), 3600).await.unwrap();
        let result = cache.get("user1").await;

        assert!(result.is_some());
        assert_eq!(result.unwrap(), perms);
    }

    #[tokio::test]
    async fn test_cache_miss() {
        let cache = InMemoryPermissionCache::new();
        let result = cache.get("nonexistent").await;

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_cache_invalidate() {
        let cache = InMemoryPermissionCache::new();
        let perms = vec!["read".to_string()];

        cache.set("user1", perms, 3600).await.unwrap();
        cache.invalidate("user1").await.unwrap();

        let result = cache.get("user1").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_cache_expiration() {
        let cache = InMemoryPermissionCache::new();
        let perms = vec!["read".to_string()];

        // Set with 0 second TTL to ensure immediate expiration
        cache.set("user1", perms, 0).await.unwrap();

        // Immediate get should return None due to expiration
        let result = cache.get("user1").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_cache_stats() {
        let cache = InMemoryPermissionCache::new();

        cache
            .set("user1", vec!["read".to_string()], 3600)
            .await
            .unwrap();
        cache.get("user1").await; // hit
        cache.get("user2").await; // miss

        let stats = cache.stats().await;
        assert_eq!(stats.total_entries, 1);
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
    }
}
