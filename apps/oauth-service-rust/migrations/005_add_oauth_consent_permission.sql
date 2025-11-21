-- OAuth Consent Permission Migration
-- Version 1: Add oauth:consent permission for user consent flow authorization
-- 执行时间: 2025-11-21
-- 说明: 为了支持P0关键修复，需要添加用户权限检查机制

-- ===============================
-- OAuth 同意权限 (OAuth Consent Permission)
-- ===============================

-- 添加 oauth:consent 权限
-- 此权限控制用户是否可以使用 OAuth 同意流程
INSERT OR IGNORE INTO permissions (
    id, name, display_name, description, resource, action, type, is_system_perm, is_active
) VALUES
    ('clh4000801', 'oauth:consent', 'OAuth Consent', 'Allow user to use OAuth consent flow', 'oauth', 'consent', 'API', true, true);

-- ===============================
-- 角色权限关联更新 (Role Permission Updates)
-- ===============================

-- 超级管理员: 添加 oauth:consent 权限
-- 超级管理员已有所有系统权限，此操作确保不遗漏
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('clh3000001', 'clh4000801');

-- 管理员: 添加 oauth:consent 权限
-- 管理员需要能够进行 OAuth 流程
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('clh3000002', 'clh4000801');

-- 普通用户: 添加 oauth:consent 权限
-- 普通用户也应该能够使用 OAuth 同意流程授权应用
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('clh3000003', 'clh4000801');

-- ===============================
-- 验证和说明
-- ===============================

-- 验证权限是否正确添加:
-- SELECT * FROM permissions WHERE name = 'oauth:consent';

-- 验证超级管理员是否拥有此权限:
-- SELECT p.name FROM permissions p
-- JOIN role_permissions rp ON p.id = rp.permission_id
-- JOIN roles r ON rp.role_id = r.id
-- WHERE r.name = 'super_admin' AND p.name = 'oauth:consent';

-- 验证特定用户是否有此权限 (例: admin用户):
-- SELECT DISTINCT p.name FROM permissions p
-- JOIN role_permissions rp ON p.id = rp.permission_id
-- JOIN user_roles ur ON rp.role_id = ur.role_id
-- JOIN users u ON ur.user_id = u.id
-- WHERE u.username = 'admin' AND p.name = 'oauth:consent';

-- ===============================
-- 权限配置说明
-- ===============================

-- 权限: oauth:consent
-- 作用: 控制用户是否可以访问和使用 OAuth 同意流程
-- 检查位置:
--   1. GET /api/v2/oauth/consent/info - 验证用户有此权限
--   2. POST /api/v2/oauth/consent/submit - 验证用户有此权限
--
-- 应用:
--   - 如果用户没有此权限，返回 403 Forbidden
--   - 防止未授权用户进行 OAuth 授权操作（权限提升攻击防护）
--
-- 默认分配:
--   - super_admin 角色: 有 (自动获得所有权限)
--   - admin 角色: 有
--   - user 角色: 有
--
-- 生产建议:
--   - 审查用户的角色分配
--   - 确保只有需要的用户拥有此权限
--   - 定期审计权限使用情况
