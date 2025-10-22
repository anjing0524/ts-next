//! Caching layer for RBAC and other frequently accessed data
//!
//! This module provides an abstraction for caching, with support for:
//! - In-memory caching (for development/testing)
//! - Redis caching (for production with Redis support)
//!
//! The cache module can be extended to support different backends
//! while maintaining a consistent interface.

pub mod permission_cache;

pub use permission_cache::PermissionCache;

#[derive(Debug)]
pub enum CacheError {
    Serialization(String),
    Deserialization(String),
    Backend(String),
}

impl std::fmt::Display for CacheError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CacheError::Serialization(msg) => write!(f, "Serialization error: {msg}"),
            CacheError::Deserialization(msg) => write!(f, "Deserialization error: {msg}"),
            CacheError::Backend(msg) => write!(f, "Cache backend error: {msg}"),
        }
    }
}

impl std::error::Error for CacheError {}
