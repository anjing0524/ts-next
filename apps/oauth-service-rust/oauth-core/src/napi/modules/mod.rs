pub mod audit;
pub mod auth;
pub mod client;
pub mod rbac;
pub mod token;
pub mod user;

// Module exports
pub use audit::AuditModule;
pub use auth::AuthModule;
pub use client::ClientModule;
pub use rbac::RbacModule;
pub use token::TokenModule;
pub use user::UserModule;

// Type exports for NAPI
pub use audit::{AuditLog, AuditLogFilter};
pub use client::{ClientInfoPublic, ClientListResponsePublic, CreateClientRequest};
pub use rbac::{PaginatedResponse, Permission, Role, UserRole};
pub use user::{UpdateProfileRequest, UserInfo};
