import { API_ROUTES } from '@repo/lib/api-routes';

/*
 * api-endpoints.ts
 * 统一定义 admin-portal 前端调用的后端接口端点常量，
 * 避免魔法字符串散落各处，便于路径变更与维护。
 */

export const ENDPOINTS = {
  // OAuth & Auth
  oauthToken: API_ROUTES.OAUTH.TOKEN,
  oauthRevoke: API_ROUTES.OAUTH.REVOKE, // 统一使用OAuth2.1标准令牌撤销

  // 用户
  users: API_ROUTES.USERS.BASE,
  userProfile: API_ROUTES.USERS.ME_PROFILE,
  userPassword: API_ROUTES.USERS.ME_PASSWORD,

  // 角色
  roles: API_ROUTES.ROLES.BASE,
  rolePermissions: API_ROUTES.ROLES.PERMISSIONS_BY_ROLE_ID,

  // 权限
  permissions: API_ROUTES.PERMISSIONS.BASE,

  // 客户端
  clients: API_ROUTES.CLIENTS.BASE,
  clientById: API_ROUTES.CLIENTS.BY_ID,
  clientSecret: API_ROUTES.CLIENTS.SECRET, // 轮换密钥

  // 审计日志
  auditLogs: API_ROUTES.AUDIT_LOGS,

  // 统计
  statsSummary: API_ROUTES.STATS.SUMMARY,

  // 系统
  systemConfig: API_ROUTES.SYSTEM.CONFIG,
};

export type EndpointKey = keyof typeof ENDPOINTS; 