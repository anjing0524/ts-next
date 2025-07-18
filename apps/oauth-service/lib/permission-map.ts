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

  // --- 客户端管理 ---
  '/api/v2/clients': { GET: 'client:list', POST: 'client:create' },
  '/api/v2/clients/:clientId': {
    GET: 'client:read',
    PUT: 'client:update',
    DELETE: 'client:delete',
  },
  '/api/v2/clients/:clientId/secret': { POST: 'oauth:clients:manage' },

  // --- 角色管理 ---
  '/api/v2/roles': { GET: 'role:list', POST: 'role:create' },
  '/api/v2/roles/:roleId': { GET: 'role:read', PUT: 'role:update', DELETE: 'role:delete' },
  // 角色权限分配
  '/api/v2/roles/:roleId/permissions': {
    GET: 'roles:permissions:read',
    POST: 'roles:permissions:assign',
  },
  '/api/v2/roles/:roleId/permissions/:permissionId': {
    PUT: 'roles:permissions:assign',
    DELETE: 'roles:permissions:remove',
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
  '/api/v2/audit-logs': { GET: 'audit:list' },

  // --- 菜单权限（仅前端使用，后端可预留）---
  // 这些权限点用于前端菜单动态渲染，后端可用于接口保护
  'menu:system:user:view': {},
  'menu:system:role:view': {},
  'menu:system:permission:view': {},
  'menu:system:client:view': {},
  'menu:system:audit:view': {},

  // --- 仪表盘与其他 ---
  'dashboard:view': {},
};
