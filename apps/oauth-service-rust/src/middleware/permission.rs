use crate::error::{AppError, AuthError};
use crate::middleware::auth::AuthContext;
use axum::{extract::Request, http::Method, middleware::Next, response::Response};
use std::collections::HashMap;

/// 定义路由权限映射
/// 格式: (HTTP方法, 路径) -> 所需权限
pub fn get_route_permissions() -> HashMap<(Method, &'static str), Vec<&'static str>> {
    let mut permissions = HashMap::new();

    // 客户端管理权限
    permissions.insert((Method::GET, "/api/v2/admin/clients"), vec!["clients:read"]);
    permissions.insert(
        (Method::POST, "/api/v2/admin/clients"),
        vec!["clients:create"],
    );
    permissions.insert(
        (Method::GET, "/api/v2/admin/clients/:client_id"),
        vec!["clients:read"],
    );
    permissions.insert(
        (Method::PUT, "/api/v2/admin/clients/:client_id"),
        vec!["clients:update"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/clients/:client_id"),
        vec!["clients:delete"],
    );

    // 用户管理权限
    permissions.insert((Method::GET, "/api/v2/admin/users"), vec!["users:read"]);
    permissions.insert((Method::POST, "/api/v2/admin/users"), vec!["users:create"]);
    permissions.insert(
        (Method::GET, "/api/v2/admin/users/:user_id"),
        vec!["users:read"],
    );
    permissions.insert(
        (Method::PUT, "/api/v2/admin/users/:user_id"),
        vec!["users:update"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/users/:user_id"),
        vec!["users:delete"],
    );

    // 权限管理权限
    permissions.insert(
        (Method::GET, "/api/v2/admin/permissions"),
        vec!["permissions:read"],
    );
    permissions.insert(
        (Method::POST, "/api/v2/admin/permissions"),
        vec!["permissions:create"],
    );
    permissions.insert(
        (Method::GET, "/api/v2/admin/permissions/:permission_id"),
        vec!["permissions:read"],
    );
    permissions.insert(
        (Method::PUT, "/api/v2/admin/permissions/:permission_id"),
        vec!["permissions:update"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/permissions/:permission_id"),
        vec!["permissions:delete"],
    );

    // 角色管理权限
    permissions.insert((Method::GET, "/api/v2/admin/roles"), vec!["roles:read"]);
    permissions.insert((Method::POST, "/api/v2/admin/roles"), vec!["roles:create"]);
    permissions.insert(
        (Method::GET, "/api/v2/admin/roles/:role_id"),
        vec!["roles:read"],
    );
    permissions.insert(
        (Method::PUT, "/api/v2/admin/roles/:role_id"),
        vec!["roles:update"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/roles/:role_id"),
        vec!["roles:delete"],
    );
    permissions.insert(
        (Method::POST, "/api/v2/admin/roles/:role_id/permissions"),
        vec!["roles:manage"],
    );
    permissions.insert(
        (Method::GET, "/api/v2/admin/roles/:role_id/permissions"),
        vec!["roles:read"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/roles/:role_id/permissions"),
        vec!["roles:manage"],
    );
    permissions.insert(
        (Method::POST, "/api/v2/admin/users/:user_id/roles"),
        vec!["users:manage_roles"],
    );
    permissions.insert(
        (Method::GET, "/api/v2/admin/users/:user_id/roles"),
        vec!["users:read"],
    );
    permissions.insert(
        (Method::DELETE, "/api/v2/admin/users/:user_id/roles"),
        vec!["users:manage_roles"],
    );

    permissions
}

/// 检查用户是否拥有所需权限
fn has_permissions(user_permissions: &[String], required_permissions: &[&str]) -> bool {
    for required_perm in required_permissions {
        if !user_permissions
            .iter()
            .any(|user_perm| user_perm == required_perm)
        {
            return false;
        }
    }
    true
}

/// 权限检查中间件
pub async fn permission_middleware(request: Request, next: Next) -> Result<Response, AppError> {
    // 公开路径列表，不需要权限检查
    let public_paths = [
        "/health",
        "/api/v2/oauth/token",
        "/api/v2/oauth/authorize",
        "/api/v2/oauth/introspect",
        "/api/v2/oauth/revoke",
        "/api/v2/auth/login",          // ✅ OAuth login endpoint - must be public
        "/api/v2/auth/authenticate",   // ✅ Authentication endpoint - must be public
    ];

    let path = request.uri().path();

    // 跳过公开路径的权限检查
    if public_paths.contains(&path) {
        return Ok(next.run(request).await);
    }

    // 获取认证上下文
    let auth_context = request
        .extensions()
        .get::<AuthContext>()
        .ok_or(AuthError::InvalidToken)?;

    // 获取路由权限映射
    let route_permissions = get_route_permissions();
    let method = request.method().clone();

    // 查找匹配的路由权限
    for ((route_method, route_path), required_perms) in &route_permissions {
        if method == route_method && path_matches(path, route_path) {
            // 检查权限
            if !has_permissions(&auth_context.permissions, required_perms) {
                tracing::warn!(
                    user_id = ?auth_context.user_id,
                    path = path,
                    method = %method,
                    required_perms = ?required_perms,
                    user_perms = ?auth_context.permissions,
                    "Permission denied"
                );
                return Err(AuthError::InsufficientPermissions.into());
            }
            tracing::debug!(
                user_id = ?auth_context.user_id,
                path = path,
                method = %method,
                "Permission granted"
            );
            break;
        }
    }

    Ok(next.run(request).await)
}

/// 检查路径是否匹配路由模式
/// 支持两种参数形式: {id} 和 :id
fn path_matches(request_path: &str, route_pattern: &str) -> bool {
    let request_parts: Vec<&str> = request_path.split('/').collect();
    let route_parts: Vec<&str> = route_pattern.split('/').collect();

    if request_parts.len() != route_parts.len() {
        return false;
    }

    for (req_part, route_part) in request_parts.iter().zip(route_parts.iter()) {
        // Check for route parameters in both {id} and :id formats
        if (route_part.starts_with('{') && route_part.ends_with('}')) || route_part.starts_with(':')
        {
            // 这是路径参数，匹配任何值
            continue;
        } else if req_part != route_part {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_matches() {
        // Test with {id} format (OpenAPI/Swagger style)
        assert!(path_matches(
            "/api/v2/admin/clients",
            "/api/v2/admin/clients"
        ));
        assert!(path_matches(
            "/api/v2/admin/clients/123",
            "/api/v2/admin/clients/{id}"
        ));
        assert!(path_matches(
            "/api/v2/admin/users/abc",
            "/api/v2/admin/users/{id}"
        ));

        // Test with :id format (Axum style)
        assert!(path_matches(
            "/api/v2/admin/clients/123",
            "/api/v2/admin/clients/:client_id"
        ));
        assert!(path_matches(
            "/api/v2/admin/users/abc",
            "/api/v2/admin/users/:user_id"
        ));
        assert!(path_matches(
            "/api/v2/admin/roles/xyz/permissions",
            "/api/v2/admin/roles/:role_id/permissions"
        ));

        // Negative cases
        assert!(!path_matches(
            "/api/v2/admin/clients",
            "/api/v2/admin/users"
        ));
        assert!(!path_matches(
            "/api/v2/admin/clients/123/details",
            "/api/v2/admin/clients/{id}"
        ));
        assert!(!path_matches(
            "/api/v2/admin/clients/123/details",
            "/api/v2/admin/clients/:id"
        ));
    }

    #[test]
    fn test_has_permissions() {
        let user_perms = vec![
            "clients:read".to_string(),
            "clients:create".to_string(),
            "users:read".to_string(),
        ];

        assert!(has_permissions(&user_perms, &["clients:read"]));
        assert!(has_permissions(
            &user_perms,
            &["clients:read", "users:read"]
        ));
        assert!(!has_permissions(&user_perms, &["clients:delete"]));
        assert!(!has_permissions(
            &user_perms,
            &["clients:read", "permissions:read"]
        ));
    }

    #[test]
    fn test_get_route_permissions() {
        let permissions = get_route_permissions();

        assert!(permissions.contains_key(&(Method::GET, "/api/v2/admin/clients")));
        assert!(permissions.contains_key(&(Method::POST, "/api/v2/admin/clients")));
        assert!(permissions.contains_key(&(Method::GET, "/api/v2/admin/clients/:client_id")));
        assert!(permissions.contains_key(&(Method::PUT, "/api/v2/admin/clients/:client_id")));
        assert!(permissions.contains_key(&(Method::DELETE, "/api/v2/admin/clients/:client_id")));

        // Verify some other routes are configured
        assert!(permissions.contains_key(&(Method::GET, "/api/v2/admin/users")));
        assert!(permissions.contains_key(&(Method::POST, "/api/v2/admin/roles")));
    }
}
