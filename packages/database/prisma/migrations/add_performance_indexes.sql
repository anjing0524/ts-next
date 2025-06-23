-- 性能优化索引脚本
-- Performance optimization indexes script
-- 
-- 此脚本为OAuth2和RBAC系统的关键查询添加索引，
-- 以提升数据库查询性能和响应速度。
-- 
-- This script adds indexes for critical queries in OAuth2 and RBAC systems
-- to improve database query performance and response time.

-- 1. OAuth2 相关索引 (OAuth2 related indexes)

-- 授权码查询优化 (Authorization code query optimization)
CREATE INDEX IF NOT EXISTS idx_authorization_code_code ON "AuthorizationCode"("code");
CREATE INDEX IF NOT EXISTS idx_authorization_code_client_expires ON "AuthorizationCode"("clientId", "expiresAt");
CREATE INDEX IF NOT EXISTS idx_authorization_code_user_expires ON "AuthorizationCode"("userId", "expiresAt");

-- 访问令牌查询优化 (Access token query optimization)
CREATE INDEX IF NOT EXISTS idx_access_token_jti ON "AccessToken"("jti");
CREATE INDEX IF NOT EXISTS idx_access_token_client_expires ON "AccessToken"("clientId", "expiresAt");
CREATE INDEX IF NOT EXISTS idx_access_token_user_expires ON "AccessToken"("userId", "expiresAt");

-- 刷新令牌查询优化 (Refresh token query optimization)
CREATE INDEX IF NOT EXISTS idx_refresh_token_jti ON "RefreshToken"("jti");
CREATE INDEX IF NOT EXISTS idx_refresh_token_client_expires ON "RefreshToken"("clientId", "expiresAt");
CREATE INDEX IF NOT EXISTS idx_refresh_token_user_expires ON "RefreshToken"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON "RefreshToken"("isRevoked");

-- 令牌黑名单查询优化 (Token blacklist query optimization)
CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON "TokenBlacklist"("jti");
CREATE INDEX IF NOT EXISTS idx_token_blacklist_created ON "TokenBlacklist"("createdAt");

-- 2. RBAC 相关索引 (RBAC related indexes)

-- 用户角色关联查询优化 (User role association query optimization)
CREATE INDEX IF NOT EXISTS idx_user_role_user_active ON "UserRole"("userId", "isActive");
CREATE INDEX IF NOT EXISTS idx_user_role_role_active ON "UserRole"("roleId", "isActive");
CREATE INDEX IF NOT EXISTS idx_user_role_expires ON "UserRole"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_user_role_user_expires_active ON "UserRole"("userId", "expiresAt", "isActive");

-- 角色权限关联查询优化 (Role permission association query optimization)
CREATE INDEX IF NOT EXISTS idx_role_permission_role ON "RolePermission"("roleId");
CREATE INDEX IF NOT EXISTS idx_role_permission_permission ON "RolePermission"("permissionId");

-- 权限查询优化 (Permission query optimization)
CREATE INDEX IF NOT EXISTS idx_permission_name_active ON "Permission"("name", "isActive");
CREATE INDEX IF NOT EXISTS idx_permission_type_active ON "Permission"("type", "isActive");

-- 角色查询优化 (Role query optimization)
CREATE INDEX IF NOT EXISTS idx_role_name_active ON "Role"("name", "isActive");

-- 3. 用户相关索引 (User related indexes)

-- 用户查询优化 (User query optimization)
CREATE INDEX IF NOT EXISTS idx_user_email_active ON "User"("email", "isActive");
CREATE INDEX IF NOT EXISTS idx_user_username_active ON "User"("username", "isActive");
CREATE INDEX IF NOT EXISTS idx_user_created ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS idx_user_last_login ON "User"("lastLoginAt");

-- 4. 客户端相关索引 (Client related indexes)

-- 第三方客户端查询优化 (Third-party client query optimization)
CREATE INDEX IF NOT EXISTS idx_third_party_client_id_active ON "ThirdPartyClient"("clientId", "isActive");
CREATE INDEX IF NOT EXISTS idx_third_party_client_name ON "ThirdPartyClient"("name");

-- 5. 审计日志索引 (Audit log indexes)

-- 审计日志查询优化 (Audit log query optimization)
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_created ON "AuditLog"("resourceType", "createdAt");
CREATE INDEX IF NOT EXISTS idx_audit_log_ip_created ON "AuditLog"("ipAddress", "createdAt");
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON "AuditLog"("createdAt");

-- 6. 安全相关索引 (Security related indexes)

-- 密码策略索引 (Password policy indexes)
CREATE INDEX IF NOT EXISTS idx_password_policy_user ON "PasswordPolicy"("userId");
CREATE INDEX IF NOT EXISTS idx_password_policy_active ON "PasswordPolicy"("isActive");

-- 安全策略索引 (Security policy indexes)
CREATE INDEX IF NOT EXISTS idx_security_policy_user ON "SecurityPolicy"("userId");
CREATE INDEX IF NOT EXISTS idx_security_policy_active ON "SecurityPolicy"("isActive");

-- IP白名单索引 (IP whitelist indexes)
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_user_active ON "IpWhitelist"("userId", "isActive");
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_ip ON "IpWhitelist"("ipAddress");

-- 7. 复合索引优化 (Composite index optimization)

-- 用户权限查询的复合索引 (Composite indexes for user permission queries)
CREATE INDEX IF NOT EXISTS idx_user_role_permission_lookup ON "UserRole"("userId", "isActive", "expiresAt") 
  WHERE "isActive" = true;

-- OAuth2 令牌验证的复合索引 (Composite indexes for OAuth2 token validation)
CREATE INDEX IF NOT EXISTS idx_access_token_validation ON "AccessToken"("jti", "expiresAt", "clientId");
CREATE INDEX IF NOT EXISTS idx_refresh_token_validation ON "RefreshToken"("jti", "expiresAt", "isRevoked", "clientId");

-- 8. 部分索引优化 (Partial index optimization)

-- 仅为活跃用户创建索引 (Create indexes only for active users)
CREATE INDEX IF NOT EXISTS idx_active_users_email ON "User"("email") 
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_active_users_username ON "User"("username") 
  WHERE "isActive" = true;

-- 仅为活跃角色创建索引 (Create indexes only for active roles)
CREATE INDEX IF NOT EXISTS idx_active_roles_name ON "Role"("name") 
  WHERE "isActive" = true;

-- 仅为活跃权限创建索引 (Create indexes only for active permissions)
CREATE INDEX IF NOT EXISTS idx_active_permissions_name ON "Permission"("name") 
  WHERE "isActive" = true;

-- 仅为未撤销的刷新令牌创建索引 (Create indexes only for non-revoked refresh tokens)
CREATE INDEX IF NOT EXISTS idx_active_refresh_tokens ON "RefreshToken"("userId", "clientId", "expiresAt") 
  WHERE "isRevoked" = false;

-- 9. 清理任务优化索引 (Cleanup task optimization indexes)

-- 过期数据清理索引 (Expired data cleanup indexes)
CREATE INDEX IF NOT EXISTS idx_cleanup_auth_codes ON "AuthorizationCode"("expiresAt") 
  WHERE "expiresAt" < NOW();

CREATE INDEX IF NOT EXISTS idx_cleanup_access_tokens ON "AccessToken"("expiresAt") 
  WHERE "expiresAt" < NOW();

CREATE INDEX IF NOT EXISTS idx_cleanup_refresh_tokens ON "RefreshToken"("expiresAt") 
  WHERE "expiresAt" < NOW();

-- 审计日志清理索引 (Audit log cleanup indexes)
CREATE INDEX IF NOT EXISTS idx_cleanup_audit_logs ON "AuditLog"("createdAt") 
  WHERE "createdAt" < (NOW() - INTERVAL '90 days');

-- 令牌黑名单清理索引 (Token blacklist cleanup indexes)
CREATE INDEX IF NOT EXISTS idx_cleanup_token_blacklist ON "TokenBlacklist"("createdAt") 
  WHERE "createdAt" < (NOW() - INTERVAL '30 days');

-- 10. 统计和分析索引 (Statistics and analytics indexes)

-- 用户活动分析索引 (User activity analysis indexes)
CREATE INDEX IF NOT EXISTS idx_user_activity_analysis ON "AuditLog"("userId", "action", "createdAt");

-- 客户端使用统计索引 (Client usage statistics indexes)
CREATE INDEX IF NOT EXISTS idx_client_usage_stats ON "AccessToken"("clientId", "createdAt");

-- 权限使用统计索引 (Permission usage statistics indexes)
CREATE INDEX IF NOT EXISTS idx_permission_usage_stats ON "RolePermission"("permissionId", "roleId");

-- 索引创建完成提示
-- Index creation completion notice
SELECT 'Performance optimization indexes created successfully' AS status;