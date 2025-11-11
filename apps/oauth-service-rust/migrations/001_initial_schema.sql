-- OAuth Service Database Schema for Rust Migration
-- Version 2: Normalized Schema
-- Using SQLite

-- ===============================
-- 认证核心模型 (Authentication Core)
-- ===============================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- cuid()
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,

    -- 用户基本信息
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar TEXT,
    organization TEXT,
    department TEXT,
    must_change_password INTEGER DEFAULT 1,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until DATETIME,
    created_by TEXT
);

-- OAuth客户端表 (Normalized)
CREATE TABLE IF NOT EXISTS oauth_clients (
    id TEXT PRIMARY KEY, -- cuid()
    client_id TEXT UNIQUE NOT NULL,
    client_secret TEXT, -- Hashed for confidential clients
    name TEXT NOT NULL,
    description TEXT,
    client_type TEXT DEFAULT 'PUBLIC' NOT NULL, -- 'PUBLIC' or 'CONFIDENTIAL'
    logo_uri TEXT,
    policy_uri TEXT,
    tos_uri TEXT,
    jwks_uri TEXT,
    token_endpoint_auth_method TEXT DEFAULT 'client_secret_basic' NOT NULL,
    require_pkce INTEGER DEFAULT 1 NOT NULL,
    require_consent INTEGER DEFAULT 1 NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Token配置
    access_token_ttl INTEGER DEFAULT 3600 NOT NULL,
    refresh_token_ttl INTEGER DEFAULT 2592000 NOT NULL,
    authorization_code_lifetime INTEGER DEFAULT 600 NOT NULL,
    strict_redirect_uri_matching INTEGER DEFAULT 1 NOT NULL,
    allow_localhost_redirect INTEGER DEFAULT 0 NOT NULL,
    require_https_redirect INTEGER DEFAULT 1 NOT NULL
);

-- 客户端关联表
CREATE TABLE IF NOT EXISTS client_redirect_uris (
    client_id TEXT NOT NULL,
    uri TEXT NOT NULL,
    PRIMARY KEY (client_id, uri),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_grant_types (
    client_id TEXT NOT NULL,
    grant_type TEXT NOT NULL,
    PRIMARY KEY (client_id, grant_type),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_response_types (
    client_id TEXT NOT NULL,
    response_type TEXT NOT NULL,
    PRIMARY KEY (client_id, response_type),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_allowed_scopes (
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    PRIMARY KEY (client_id, scope),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_permissions (
    client_id TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (client_id, permission),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_ip_whitelist (
    client_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    PRIMARY KEY (client_id, ip_address),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);


-- 授权码表
CREATE TABLE IF NOT EXISTS authorization_codes (
    id TEXT PRIMARY KEY, -- cuid()
    code TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL, -- Space-separated string
    expires_at DATETIME NOT NULL,
    code_challenge TEXT,
    code_challenge_method TEXT,
    nonce TEXT,
    is_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

-- 访问令牌表
CREATE TABLE IF NOT EXISTS access_tokens (
    id TEXT PRIMARY KEY, -- cuid()
    token TEXT UNIQUE,
    token_hash TEXT UNIQUE,
    jti TEXT UNIQUE,
    user_id TEXT,
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL, -- Space-separated string
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

-- 刷新令牌表
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY, -- cuid()
    token TEXT UNIQUE,
    token_hash TEXT UNIQUE,
    jti TEXT UNIQUE,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL, -- Space-separated string
    expires_at DATETIME NOT NULL,
    is_revoked INTEGER DEFAULT 0,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    previous_token_id TEXT UNIQUE,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

-- ===============================
-- 权限管理核心 (Permission Management Core)
-- ===============================

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY, -- cuid()
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    is_system_role INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY, -- cuid()
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    type TEXT DEFAULT 'API', -- 'API', 'MENU', 'DATA'
    is_system_perm INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API权限详细信息表
CREATE TABLE IF NOT EXISTS api_permissions (
    id TEXT PRIMARY KEY, -- cuid()
    permission_id TEXT UNIQUE NOT NULL,
    http_method TEXT NOT NULL, -- 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'
    endpoint TEXT NOT NULL,
    rate_limit INTEGER,

    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 菜单权限详细信息表
CREATE TABLE IF NOT EXISTS menu_permissions (
    id TEXT PRIMARY KEY, -- cuid()
    permission_id TEXT UNIQUE NOT NULL,
    menu_id TEXT NOT NULL,

    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 数据权限详细信息表
CREATE TABLE IF NOT EXISTS data_permissions (
    id TEXT PRIMARY KEY, -- cuid()
    permission_id TEXT UNIQUE NOT NULL,
    table_name TEXT NOT NULL,
    column_name TEXT,
    conditions TEXT, -- JSON

    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 菜单表
CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY, -- cuid()
    name TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    path TEXT,
    component TEXT,
    icon TEXT,
    "order" INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parent_id) REFERENCES menus(id)
);

-- 用户角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    context TEXT, -- JSON
    expires_at DATETIME,
    assigned_by TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 角色权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    conditions TEXT, -- JSON
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- ===============================
-- 审计与监控 (Auditing & Monitoring)
-- ===============================

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), -- UUID
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT, -- JSON
    status TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 密码历史表
CREATE TABLE IF NOT EXISTS password_histories (
    id TEXT PRIMARY KEY, -- cuid()
    user_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 密码重置请求表
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY, -- cuid()
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===============================
-- OAuth Scopes (权限范围)
-- ===============================

-- Scope表
CREATE TABLE IF NOT EXISTS scopes (
    id TEXT PRIMARY KEY, -- cuid()
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    is_oidc_scope INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scope与Permission关联表
CREATE TABLE IF NOT EXISTS scope_permissions (
    scope_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (scope_id, permission_id),
    FOREIGN KEY (scope_id) REFERENCES scopes(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 用户同意授权记录表
CREATE TABLE IF NOT EXISTS consent_grants (
    id TEXT PRIMARY KEY, -- cuid()
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    scopes TEXT NOT NULL, -- JSON array
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    revoked_at DATETIME,

    UNIQUE (user_id, client_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);

-- ===============================
-- 安全相关表 (Security)
-- ===============================

-- 已撤销的JWT ID表
CREATE TABLE IF NOT EXISTS revoked_auth_jtis (
    jti TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 登录尝试记录表
CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY, -- cuid()
    user_id TEXT,
    username TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    successful INTEGER NOT NULL,
    failure_reason TEXT,
    mfa_attempted INTEGER DEFAULT 0,
    mfa_successful INTEGER,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configurations (
    id TEXT PRIMARY KEY, -- cuid()
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL, -- JSON
    description TEXT,
    type TEXT DEFAULT 'string',
    is_editable INTEGER DEFAULT 1,
    is_sensitive INTEGER DEFAULT 0,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 安全策略表
CREATE TABLE IF NOT EXISTS security_policies (
    id TEXT PRIMARY KEY, -- cuid()
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    policy TEXT NOT NULL, -- JSON
    description TEXT,
    is_active INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 通用令牌撤销黑名单
CREATE TABLE IF NOT EXISTS token_blacklist (
    id TEXT PRIMARY KEY, -- cuid()
    jti TEXT UNIQUE NOT NULL,
    token_type TEXT NOT NULL,
    user_id TEXT,
    client_id TEXT,
    expires_at DATETIME NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===============================
-- 创建索引
-- ===============================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- OAuth客户端表索引
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_is_active ON oauth_clients(is_active);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_type ON oauth_clients(client_type);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id_active ON oauth_clients(client_id, is_active);

-- 授权码表索引
CREATE INDEX IF NOT EXISTS idx_authorization_codes_code ON authorization_codes(code);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_user_id ON authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_client_id ON authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_expires_at ON authorization_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_is_used ON authorization_codes(is_used);

-- 访问令牌表索引
CREATE INDEX IF NOT EXISTS idx_access_tokens_token_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_access_tokens_jti ON access_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_access_tokens_user_id ON access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_client_id ON access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at);

-- 刷新令牌表索引
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id ON refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);

-- 角色表索引
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_is_active ON roles(is_active);

-- 权限表索引
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action);
CREATE INDEX IF NOT EXISTS idx_permissions_type ON permissions(type);
CREATE INDEX IF NOT EXISTS idx_permissions_is_active ON permissions(is_active);

-- API权限表索引
CREATE INDEX IF NOT EXISTS idx_api_permissions_http_method ON api_permissions(http_method);
CREATE INDEX IF NOT EXISTS idx_api_permissions_endpoint ON api_permissions(endpoint);

-- 菜单权限表索引
CREATE INDEX IF NOT EXISTS idx_menu_permissions_menu_id ON menu_permissions(menu_id);

-- 数据权限表索引
CREATE INDEX IF NOT EXISTS idx_data_permissions_table_name ON data_permissions(table_name);
CREATE INDEX IF NOT EXISTS idx_data_permissions_column_name ON data_permissions(column_name);

-- 菜单表索引
CREATE INDEX IF NOT EXISTS idx_menus_key ON menus(key);
CREATE INDEX IF NOT EXISTS idx_menus_parent_id ON menus(parent_id);
CREATE INDEX IF NOT EXISTS idx_menus_order ON menus("order");
CREATE INDEX IF NOT EXISTS idx_menus_is_active ON menus(is_active);

-- 用户角色关联表索引
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON user_roles(expires_at);

-- 审计日志表索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id_type ON audit_logs(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_timestamp ON audit_logs(user_id, timestamp);

-- 密码历史表索引
CREATE INDEX IF NOT EXISTS idx_password_histories_user_id_created_at ON password_histories(user_id, created_at);

-- 密码重置请求表索引
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_token ON password_reset_requests(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires_at ON password_reset_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_is_used ON password_reset_requests(is_used);

-- 已撤销JWT ID表索引
CREATE INDEX IF NOT EXISTS idx_revoked_auth_jtis_user_id ON revoked_auth_jtis(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_auth_jtis_expires_at ON revoked_auth_jtis(expires_at);

-- 登录尝试记录表索引
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp);

-- 安全策略表索引
CREATE INDEX IF NOT EXISTS idx_security_policies_name_type ON security_policies(name, type);
CREATE INDEX IF NOT EXISTS idx_security_policies_type_active_default ON security_policies(type, is_active, is_default);

-- 令牌黑名单表索引
CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_client_id ON token_blacklist(client_id);
