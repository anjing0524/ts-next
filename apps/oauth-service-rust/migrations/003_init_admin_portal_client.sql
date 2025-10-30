-- Admin Portal OAuth Client Initialization
-- Version 1.0
-- 专用脚本：为 Admin Portal 初始化 OAuth 2.1 第三方客户端
-- 注意：此脚本可独立运行或作为数据库初始化的一部分

-- ===============================
-- Admin Portal OAuth 客户端配置
-- ===============================
--
-- Admin Portal 两重身份：
-- 1. OAuth 2.1 第三方客户端 - 访问受保护资源需要 token
-- 2. OAuth Service UI 提供者 - 提供 /login 和 /oauth/consent 页面
--
-- 此脚本初始化身份 1 所需的客户端配置

-- 删除旧的 admin-portal 客户端（如果存在）
DELETE FROM client_permissions WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM client_ip_whitelist WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM client_allowed_scopes WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM client_response_types WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM client_grant_types WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM client_redirect_uris WHERE client_id IN (
    SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'
);
DELETE FROM oauth_clients WHERE client_id = 'auth-center-admin-client';

-- ===============================
-- 创建 Admin Portal OAuth 客户端
-- ===============================

INSERT INTO oauth_clients (
    id,
    client_id,
    client_secret,
    name,
    description,
    client_type,
    logo_uri,
    policy_uri,
    tos_uri,
    token_endpoint_auth_method,
    require_pkce,
    require_consent,
    is_active,
    created_at,
    updated_at,
    access_token_ttl,
    refresh_token_ttl,
    authorization_code_lifetime,
    strict_redirect_uri_matching,
    allow_localhost_redirect,
    require_https_redirect
) VALUES (
    'clh_admin_portal_001',
    'auth-center-admin-client',
    'CHANGE_ME_IN_PRODUCTION_SECRET_KEY_12345678901234567890',
    'Admin Portal',
    '管理员后台应用 - OAuth 2.1 第三方客户端，使用授权码流程 + PKCE',
    'CONFIDENTIAL',
    'https://example.com/static/admin-portal-logo.png',
    'https://example.com/policy',
    'https://example.com/terms',
    'client_secret_basic',
    true,   -- require_pkce: 强制使用 PKCE (S256)，提高安全性
    true,   -- require_consent: 强制用户明确同意授权
    true,   -- is_active: 客户端已激活
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    3600,       -- access_token_ttl: 1 小时
    2592000,    -- refresh_token_ttl: 30 天
    600,        -- authorization_code_lifetime: 10 分钟
    true,       -- strict_redirect_uri_matching: 严格匹配重定向 URI
    true,       -- allow_localhost_redirect: 允许本地开发环境
    false       -- require_https_redirect: 开发环境不要求 HTTPS（生产应改为 true）
);

-- ===============================
-- 配置重定向 URI
-- ===============================
-- OAuth 回调 URI 列表
-- 开发环境、测试环境、生产环境均需配置

INSERT INTO client_redirect_uris (client_id, uri) VALUES
    -- 开发环境
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'http://localhost:3002/auth/callback'
    ),
    -- 通过 Pingora 代理（推荐）
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'http://localhost:6188/auth/callback'
    ),
    -- 生产环境示例
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'https://admin.example.com/auth/callback'
    ),
    -- 备用生产环境
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'https://admin.yourdomain.com/auth/callback'
    );

-- ===============================
-- 配置授权类型
-- ===============================
-- Admin Portal 支持的授权流程

INSERT INTO client_grant_types (client_id, grant_type) VALUES
    -- Authorization Code Flow (主要)
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'authorization_code'
    ),
    -- Token Refresh (刷新令牌)
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'refresh_token'
    );

-- ===============================
-- 配置响应类型
-- ===============================
-- Admin Portal 使用授权码流程

INSERT INTO client_response_types (client_id, response_type) VALUES
    (
        (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client'),
        'code'
    );

-- ===============================
-- 配置权限范围 (Scopes)
-- ===============================
-- Admin Portal 需要的标准 OIDC 和自定义 scopes

-- 首先确保 scopes 表中存在所需的 scope
INSERT OR IGNORE INTO scopes (id, name, description, is_public, is_oidc_scope, is_active)
VALUES
    ('scope_openid', 'openid', 'OpenID Connect scope', true, true, true),
    ('scope_profile', 'profile', 'User profile information', true, true, true),
    ('scope_email', 'email', 'User email address', true, true, true),
    ('scope_admin', 'admin', 'Admin panel access scope', false, false, true),
    ('scope_manage_users', 'manage_users', 'User management scope', false, false, true),
    ('scope_manage_roles', 'manage_roles', 'Role management scope', false, false, true),
    ('scope_manage_clients', 'manage_clients', 'Client management scope', false, false, true),
    ('scope_audit', 'audit', 'Audit logs access scope', false, false, true),
    ('scope_system_config', 'system_config', 'System configuration access scope', false, false, true);

-- 配置 Admin Portal 允许的 scopes
INSERT OR IGNORE INTO client_allowed_scopes (client_id, scope)
SELECT
    oauth_clients.id,
    scopes.name
FROM oauth_clients
CROSS JOIN scopes
WHERE oauth_clients.client_id = 'auth-center-admin-client'
AND scopes.name IN (
    'openid', 'profile', 'email',
    'admin', 'manage_users', 'manage_roles', 'manage_clients',
    'audit', 'system_config'
);

-- ===============================
-- 配置客户端权限 (Client Permissions)
-- ===============================
-- Admin Portal 作为客户端所拥有的权限

-- 首先确保权限表中存在这些权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('perm_admin_all', 'admin:*', 'Admin All', 'Full admin access', 'admin', '*', 'API', true, true),
    ('perm_users_manage', 'users:manage', 'Manage Users', 'User management', 'users', 'manage', 'API', true, true),
    ('perm_roles_manage', 'roles:manage', 'Manage Roles', 'Role management', 'roles', 'manage', 'API', true, true),
    ('perm_clients_manage', 'clients:manage', 'Manage Clients', 'OAuth client management', 'clients', 'manage', 'API', true, true),
    ('perm_audit_view', 'audit:view', 'View Audit', 'View audit logs', 'audit', 'view', 'API', true, true),
    ('perm_system_config', 'system:config', 'System Config', 'System configuration', 'system', 'config', 'API', true, true);

-- 分配权限给 Admin Portal 客户端
INSERT OR IGNORE INTO client_permissions (client_id, permission)
SELECT
    oauth_clients.id,
    permissions.name
FROM oauth_clients
CROSS JOIN permissions
WHERE oauth_clients.client_id = 'auth-center-admin-client'
AND permissions.name IN (
    'admin:*', 'users:manage', 'roles:manage', 'clients:manage', 'audit:view', 'system:config'
);

-- ===============================
-- 配置 IP 白名单（可选）
-- ===============================
-- 如果需要限制特定 IP 才能使用此客户端，可在此配置
-- 示例：开发环境允许 localhost

INSERT OR IGNORE INTO client_ip_whitelist (client_id, ip_address)
SELECT
    oauth_clients.id,
    '127.0.0.1'
FROM oauth_clients
WHERE oauth_clients.client_id = 'auth-center-admin-client'
UNION ALL
SELECT
    oauth_clients.id,
    '::1'
FROM oauth_clients
WHERE oauth_clients.client_id = 'auth-center-admin-client';

-- ===============================
-- 验证配置
-- ===============================

-- 验证客户端是否成功创建
SELECT
    'Admin Portal Client Configuration' as title,
    id,
    client_id,
    name,
    client_type,
    require_pkce,
    require_consent,
    is_active,
    created_at
FROM oauth_clients
WHERE client_id = 'auth-center-admin-client';

-- 验证重定向 URI
SELECT
    'Redirect URIs' as title,
    COUNT(*) as total_uris
FROM client_redirect_uris
WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client');

-- 验证允许的 scopes
SELECT
    'Allowed Scopes' as title,
    COUNT(*) as total_scopes
FROM client_allowed_scopes
WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client');

-- 验证权限
SELECT
    'Client Permissions' as title,
    COUNT(*) as total_permissions
FROM client_permissions
WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = 'auth-center-admin-client');

-- ===============================
-- 注意事项
-- ===============================
--
-- 1. 生产环境务必更改 client_secret
--    - 当前使用的是占位符 secret
--    - 应该生成安全的随机 secret（至少 32 字符）
--    - 在 Admin Portal 环境变量中配置相同的 secret
--
-- 2. HTTPS 配置
--    - 生产环境应设置 require_https_redirect = true
--    - 更新所有重定向 URI 使用 https://
--
-- 3. 权限细粒度控制
--    - 当前配置给予 Admin Portal 较大权限
--    - 根据实际需求调整权限范围
--
-- 4. Token 生命周期
--    - access_token_ttl: 1 小时（推荐）
--    - refresh_token_ttl: 30 天（可根据需求调整）
--    - authorization_code_lifetime: 10 分钟（安全性考虑）
--
-- 5. PKCE 强制
--    - require_pkce = true（已启用）
--    - 提高授权码流程的安全性
--    - 防止授权码拦截攻击
