//! OAuth Models - Shared data structures for OAuth service
//!
//! This crate defines all core data models used throughout the OAuth service.
//! It serves as the single source of truth for data structure definitions.

pub mod auth_code;
pub mod client;
pub mod permission;
pub mod refresh_token;
pub mod role;
pub mod user;

// Re-export commonly used types
pub use auth_code::AuthCode;
pub use client::{ClientType, OAuthClient, OAuthClientDetails};
pub use permission::{Permission, PermissionType};
pub use refresh_token::RefreshToken;
pub use role::Role;
pub use user::User;
