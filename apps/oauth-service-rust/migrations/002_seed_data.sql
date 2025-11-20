-- OAuth Service Seed Data
-- Version 1: Initial system setup with demo user and clients
-- 注意：此脚本应在 001_initial_schema.sql 执行后运行

-- ===============================
-- 演示用户数据 (Demo Users)
-- ===============================

-- 创建超级管理员用户
-- 用户名: admin
-- 密码: admin123 (bcrypt hash: $2b$12$.....)
-- 注意：实际密码应该由认证系统生成和验证
INSERT OR IGNORE INTO users (
    id, username, password_hash, is_active, created_at, updated_at,
    display_name, first_name, last_name, must_change_password
) VALUES (
    'clh1234567890abcdef000000',
    'admin',
    '$2b$12$RpakPpV3Dqfmv7bKS/Fa1O0dGaA1O.n8OY5uAWd6GVDIWvdb0pkqu', -- password: admin123
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Admin User',
    'Admin',
    'User',
    false
);

-- 创建演示用户
INSERT OR IGNORE INTO users (
    id, username, password_hash, is_active, created_at, updated_at,
    display_name, first_name, last_name, must_change_password
) VALUES (
    'clh1234567890abcdef000001',
    'demo',
    '$2b$12$RpakPpV3Dqfmv7bKS/Fa1O0dGaA1O.n8OY5uAWd6GVDIWvdb0pkqu', -- password: admin123
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Demo User',
    'Demo',
    'User',
    false
);

-- ===============================
-- OAuth 客户端数据 (OAuth Clients)
-- ===============================

-- Admin Portal 客户端 (第三方客户端模式)
INSERT OR IGNORE INTO oauth_clients (
    id, client_id, client_secret, name, description,
    client_type, logo_uri, require_pkce, require_consent,
    is_active, created_at, updated_at,
    access_token_ttl, refresh_token_ttl, authorization_code_lifetime
) VALUES (
    'clh1234567890abcdef010001',
    'auth-center-admin-client',
    'secret_admin_portal_default_key_change_in_production',
    'Admin Portal',
    '管理员后台应用，使用 OAuth 2.1 授权码流程 + PKCE',
    'CONFIDENTIAL',
    'https://example.com/admin-logo.png',
    true,  -- require_pkce: 强制使用 PKCE
    true,  -- require_consent: 强制用户同意
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    3600,      -- access_token_ttl: 1 hour
    2592000,   -- refresh_token_ttl: 30 days
    600        -- authorization_code_lifetime: 10 minutes
);

-- 测试用客户端 (仅开发环境)
INSERT OR IGNORE INTO oauth_clients (
    id, client_id, client_secret, name, description,
    client_type, logo_uri, require_pkce, require_consent,
    is_active, created_at, updated_at,
    access_token_ttl, refresh_token_ttl, authorization_code_lifetime
) VALUES (
    'clh1234567890abcdef010002',
    'test-client',
    'test_client_secret_dev_only',
    'Test Client',
    '仅用于开发和测试的客户端',
    'PUBLIC',
    NULL,
    false,  -- require_pkce: 允许不使用 PKCE (仅用于测试)
    false,  -- require_consent: 跳过用户同意页面
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    3600,
    2592000,
    600
);

-- ===============================
-- 客户端重定向 URI (Client Redirect URIs)
-- ===============================

-- Admin Portal 回调 URI
INSERT OR IGNORE INTO client_redirect_uris (client_id, uri) VALUES
    ('clh1234567890abcdef010001', 'http://localhost:3002/auth/callback'),
    ('clh1234567890abcdef010001', 'http://localhost:6188/auth/callback'),
    ('clh1234567890abcdef010001', 'https://admin.example.com/auth/callback');

-- Test Client 回调 URI
INSERT OR IGNORE INTO client_redirect_uris (client_id, uri) VALUES
    ('clh1234567890abcdef010002', 'http://localhost:3000/callback');

-- ===============================
-- 客户端授权类型 (Client Grant Types)
-- ===============================

-- Admin Portal: 授权码流程
INSERT OR IGNORE INTO client_grant_types (client_id, grant_type) VALUES
    ('clh1234567890abcdef010001', 'authorization_code'),
    ('clh1234567890abcdef010001', 'refresh_token');

-- Test Client
INSERT OR IGNORE INTO client_grant_types (client_id, grant_type) VALUES
    ('clh1234567890abcdef010002', 'authorization_code'),
    ('clh1234567890abcdef010002', 'refresh_token');

-- ===============================
-- 客户端响应类型 (Client Response Types)
-- ===============================

INSERT OR IGNORE INTO client_response_types (client_id, response_type) VALUES
    ('clh1234567890abcdef010001', 'code'),
    ('clh1234567890abcdef010002', 'code');

-- ===============================
-- 客户端权限范围 (Client Allowed Scopes)
-- ===============================

INSERT OR IGNORE INTO client_allowed_scopes (client_id, scope) VALUES
    ('clh1234567890abcdef010001', 'openid'),
    ('clh1234567890abcdef010001', 'profile'),
    ('clh1234567890abcdef010001', 'email'),
    ('clh1234567890abcdef010002', 'openid'),
    ('clh1234567890abcdef010002', 'profile');

-- ===============================
-- 权限范围 (Scopes)
-- ===============================

INSERT OR IGNORE INTO scopes (id, name, description, is_public, is_oidc_scope, is_active) VALUES
    ('clh2000001', 'openid', 'OpenID Connect scope for user identification', true, true, true),
    ('clh2000002', 'profile', 'User profile information (name, avatar, etc.)', true, true, true),
    ('clh2000003', 'email', 'User email address', true, true, true),
    ('clh2000004', 'phone', 'User phone number', true, true, true),
    ('clh2000005', 'address', 'User address information', true, true, true);

-- ===============================
-- 角色 (Roles)
-- ===============================

-- 超级管理员角色
INSERT OR IGNORE INTO roles (id, name, display_name, description, is_system_role, is_active) VALUES
    ('clh3000001', 'super_admin', '超级管理员', 'Full access to all system features', true, true);

-- 管理员角色
INSERT OR IGNORE INTO roles (id, name, display_name, description, is_system_role, is_active) VALUES
    ('clh3000002', 'admin', '管理员', 'Administrative access to system management', true, true);

-- 普通用户角色
INSERT OR IGNORE INTO roles (id, name, display_name, description, is_system_role, is_active) VALUES
    ('clh3000003', 'user', '普通用户', 'Regular user with basic access', true, true);

-- ===============================
-- 权限 (Permissions)
-- ===============================

-- 用户管理权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000001', 'users:list', 'View Users', 'View user list', 'users', 'list', 'API', true, true),
    ('clh4000002', 'users:create', 'Create User', 'Create new user', 'users', 'create', 'API', true, true),
    ('clh4000003', 'users:read', 'View User', 'View user details', 'users', 'read', 'API', true, true),
    ('clh4000004', 'users:update', 'Update User', 'Update user information', 'users', 'update', 'API', true, true),
    ('clh4000005', 'users:delete', 'Delete User', 'Delete user', 'users', 'delete', 'API', true, true);

-- 角色管理权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000101', 'roles:list', 'View Roles', 'View role list', 'roles', 'list', 'API', true, true),
    ('clh4000102', 'roles:create', 'Create Role', 'Create new role', 'roles', 'create', 'API', true, true),
    ('clh4000103', 'roles:update', 'Update Role', 'Update role', 'roles', 'update', 'API', true, true),
    ('clh4000104', 'roles:delete', 'Delete Role', 'Delete role', 'roles', 'delete', 'API', true, true);

-- 权限管理权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000201', 'permissions:list', 'View Permissions', 'View permission list', 'permissions', 'list', 'API', true, true),
    ('clh4000202', 'permissions:manage', 'Manage Permissions', 'Manage permissions', 'permissions', 'manage', 'API', true, true);

-- 客户端管理权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000301', 'clients:list', 'View Clients', 'View OAuth client list', 'clients', 'list', 'API', true, true),
    ('clh4000302', 'clients:create', 'Create Client', 'Register new OAuth client', 'clients', 'create', 'API', true, true),
    ('clh4000303', 'clients:update', 'Update Client', 'Update client settings', 'clients', 'update', 'API', true, true),
    ('clh4000304', 'clients:delete', 'Delete Client', 'Delete OAuth client', 'clients', 'delete', 'API', true, true);

-- 审计日志权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000401', 'audit:list', 'View Audit Logs', 'View system audit logs', 'audit', 'list', 'API', true, true),
    ('clh4000402', 'audit:export', 'Export Audit Logs', 'Export audit logs', 'audit', 'export', 'API', true, true);

-- 系统配置权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000501', 'system:config:read', 'View System Config', 'View system configuration', 'system', 'config:read', 'API', true, true),
    ('clh4000502', 'system:config:edit', 'Edit System Config', 'Modify system configuration', 'system', 'config:edit', 'API', true, true);

-- 菜单权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000601', 'menu:system:user:view', 'View User Menu', 'Access user management menu', 'menu', 'system:user:view', 'MENU', true, true),
    ('clh4000602', 'menu:system:role:view', 'View Role Menu', 'Access role management menu', 'menu', 'system:role:view', 'MENU', true, true),
    ('clh4000603', 'menu:system:permission:view', 'View Permission Menu', 'Access permission management menu', 'menu', 'system:permission:view', 'MENU', true, true),
    ('clh4000604', 'menu:system:client:view', 'View Client Menu', 'Access client management menu', 'menu', 'system:client:view', 'MENU', true, true),
    ('clh4000605', 'menu:system:audit:view', 'View Audit Menu', 'Access audit logs menu', 'menu', 'system:audit:view', 'MENU', true, true);

-- Dashboard 权限
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000701', 'dashboard:view', 'View Dashboard', 'Access dashboard', 'dashboard', 'view', 'MENU', true, true);

-- ===============================
-- 角色权限关联 (Role Permissions)
-- ===============================

-- 超级管理员: 所有权限
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'clh3000001', id FROM permissions WHERE is_system_perm = true;

-- 管理员: 大部分权限（除了用户删除）
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'clh3000002', id FROM permissions WHERE name IN (
    'users:list', 'users:read', 'users:create', 'users:update',
    'roles:list', 'roles:create', 'roles:update', 'roles:delete',
    'permissions:list', 'clients:list', 'clients:create', 'clients:update',
    'audit:list', 'system:config:read', 'system:config:edit',
    'menu:system:user:view', 'menu:system:role:view', 'menu:system:permission:view',
    'menu:system:client:view', 'menu:system:audit:view', 'dashboard:view'
);

-- 普通用户: 基本权限
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'clh3000003', id FROM permissions WHERE name IN (
    'users:list', 'users:read',
    'roles:list',
    'permissions:list',
    'menu:system:user:view', 'dashboard:view'
);

-- ===============================
-- 用户角色关联 (User Roles)
-- ===============================

-- Admin 用户: 超级管理员角色
INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_at) VALUES
    ('clh1234567890abcdef000000', 'clh3000001', CURRENT_TIMESTAMP);

-- Demo 用户: 普通用户角色
INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_at) VALUES
    ('clh1234567890abcdef000001', 'clh3000003', CURRENT_TIMESTAMP);

-- ===============================
-- 菜单 (Menus)
-- ===============================

-- 系统管理菜单
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000001', '系统管理', 'system', '/admin/system', 'settings', 10, false, true, NULL);

-- 用户管理
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000101', '用户管理', 'users', '/admin/users', 'users', 1, false, true, 'clh5000001');

-- 角色管理
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000102', '角色管理', 'roles', '/admin/system/roles', 'shield', 2, false, true, 'clh5000001');

-- 权限管理
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000103', '权限管理', 'permissions', '/admin/system/permissions', 'lock', 3, false, true, 'clh5000001');

-- 客户端管理
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000104', '客户端管理', 'clients', '/admin/system/clients', 'app', 4, false, true, 'clh5000001');

-- 审计日志
INSERT OR IGNORE INTO menus (
    id, name, key, path, icon, "order", is_hidden, is_active, parent_id
) VALUES
    ('clh5000105', '审计日志', 'audits', '/admin/system/audits', 'log', 5, false, true, 'clh5000001');

-- ===============================
-- 菜单权限关联 (Menu Permissions)
-- ===============================

INSERT OR IGNORE INTO menu_permissions (permission_id, menu_id) VALUES
    ('clh4000601', 'clh5000101'),  -- users menu
    ('clh4000602', 'clh5000102'),  -- roles menu
    ('clh4000603', 'clh5000103'),  -- permissions menu
    ('clh4000604', 'clh5000104'),  -- clients menu
    ('clh4000605', 'clh5000105');  -- audits menu

-- ===============================
-- 系统配置 (System Configurations)
-- ===============================

INSERT OR IGNORE INTO system_configurations (
    id, key, value, description, type, category, is_editable, is_sensitive
) VALUES
    ('clh6000001', 'system.name', '"Authentication Center"', 'System name', 'string', 'general', true, false),
    ('clh6000002', 'system.version', '"1.0.0"', 'System version', 'string', 'general', false, false),
    ('clh6000003', 'auth.token.access_ttl', '3600', 'Access token TTL (seconds)', 'number', 'auth', true, false),
    ('clh6000004', 'auth.token.refresh_ttl', '2592000', 'Refresh token TTL (seconds)', 'number', 'auth', true, false),
    ('clh6000005', 'security.password.min_length', '8', 'Minimum password length', 'number', 'security', true, false),
    ('clh6000006', 'security.password.require_uppercase', 'true', 'Require uppercase in password', 'boolean', 'security', true, false),
    ('clh6000007', 'security.password.require_number', 'true', 'Require number in password', 'boolean', 'security', true, false),
    ('clh6000008', 'security.login.max_attempts', '5', 'Max failed login attempts', 'number', 'security', true, false),
    ('clh6000009', 'security.login.lockout_duration', '900', 'Lockout duration (seconds)', 'number', 'security', true, false);
