// apps/oauth-service/lib/permission-map.ts
import { HttpMethod } from '@repo/database';

type PermissionMap = Record<string, Partial<Record<HttpMethod, string>>>;

/**
 * 定义一个集中的权限映射表。
 * key: 使用 path-to-regexp 语法的路由路径。
 * value: 一个对象，将 HTTP 方法映射到所需的权限字符串。
 */
export const permissionMap: PermissionMap = {
  // --- 用户管理 ---
  '/api/v2/users': { GET: 'user:list', POST: 'user:create' },
  '/api/v2/users/:userId': { GET: 'user:read', PUT: 'user:update', DELETE: 'user:delete' },
  // 用户角色分配
  '/api/v2/users/:userId/roles': {
    GET: 'user:roles:read',
    POST: 'user:roles:assign',
    DELETE: 'user:roles:remove',
  },

  // --- 用户状态和密码管理 ---
  '/api/v2/users/:userId/status': { PUT: 'user:status:update' },
  '/api/v2/users/:userId/password-reset': { POST: 'user:password:reset' },
  '/api/v2/users/:userId/lock': { POST: 'users:lock' },
  '/api/v2/users/:userId/unlock': { POST: 'users:unlock' },
  
  // --- 用户个人资料管理 ---
  '/api/v2/users/:userId/profile': { GET: 'user:profile:read', PUT: 'user:profile:update' },
  '/api/v2/users/:userId/permissions': { GET: 'users:permissions:read' },
  '/api/v2/users/:userId/permissions/verify': { POST: 'users:permissions:verify' },

  // --- 当前用户个人资料（自助服务）---
  '/api/v2/profile/me': { GET: 'profile:me:read', PUT: 'profile:me:update' },
  '/api/v2/profile/me/password': { POST: 'profile:me:password:change' },

  // --- 客户端管理 ---
  '/api/v2/clients': { GET: 'client:list', POST: 'client:create' },
  '/api/v2/clients/:clientId': {
    GET: 'client:read',
    PUT: 'client:update',
    DELETE: 'client:delete',
  },
  '/api/v2/clients/:clientId/secret': { POST: 'client:secret:reset' },

  // --- 角色管理 ---
  '/api/v2/roles': { GET: 'role:list', POST: 'role:create' },
  '/api/v2/roles/:roleId': { GET: 'role:read', PUT: 'role:update', DELETE: 'role:delete' },
  // 角色权限分配
  '/api/v2/roles/:roleId/permissions': {
    GET: 'role:permissions:list',
    POST: 'role:permissions:assign',
  },
  '/api/v2/roles/:roleId/permissions/:permissionId': {
    DELETE: 'role:permissions:remove',
  },
  // 角色批量分配
  '/api/v2/roles/batch-assign': { POST: 'roles:batch:assign' },

  // --- 权限管理 ---
  '/api/v2/permissions': {
    GET: 'permission:list',
    POST: 'permission:create',
  },
  '/api/v2/permissions/:permissionId': {
    GET: 'permission:read',
    PUT: 'permission:update',
    DELETE: 'permission:delete',
  },

  // --- 范围管理 ---
  '/api/v2/scopes': { GET: 'scope:list', POST: 'scope:create' },
  '/api/v2/scopes/:scopeId': { GET: 'scope:read', PUT: 'scope:update', DELETE: 'scope:delete' },

  // --- 审计日志 ---
  '/api/v2/audits': { GET: 'audit:list' },
  '/api/v2/audits/:logId': { GET: 'audit:read' },

  // --- 系统配置管理 ---
  '/api/v2/system-configurations': { GET: 'config:list' },
  '/api/v2/system-configurations/:key': { GET: 'config:read', PUT: 'config:update' },

  // --- 安全策略管理 ---
  '/api/v2/security-policies': { GET: 'policy:list' },
  '/api/v2/security-policies/:policyId': { GET: 'policy:read', PUT: 'policy:update' },

  // --- 菜单权限（仅前端使用，后端可预留）---
  // 这些权限点用于前端菜单动态渲染，后端可用于接口保护
  'menu:dashboard:view': {},
  'menu:system:view': {},
  'menu:system:user:view': {},
  'menu:system:role:view': {},
  'menu:system:permission:view': {},
  'menu:system:menu:view': {},
  'menu:system:client:view': {},
  'menu:system:audit:view': {},
  'menu:system:config:view': {},
  'menu:system:policy:view': {},
  'menu:profile:view': {},

  // --- 仪表盘与其他 ---
  'dashboard:view': {},
};
