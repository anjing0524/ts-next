/**
 * PermissionService - 权限服务
 * 
 * 提供统一的权限检查和管理接口
 */

import { DynamicPermissionConfig } from './dynamic-permission-config';
import { SimplifiedTokenStorage } from '../deprecated/simplified-token-storage';

export interface PermissionCheckOptions {
  cache?: boolean;
  requireAll?: boolean;
}

export interface UserContext {
  id: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin?: boolean;
}

export class PermissionService {
  private static instance: PermissionService;
  private config: DynamicPermissionConfig;
  private userContextCache: Map<string, UserContext> = new Map();

  private constructor() {
    this.config = DynamicPermissionConfig.getInstance();
  }

  static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  /**
   * 检查用户是否拥有指定权限
   */
  hasPermission(
    permissionId: string,
    userContext?: UserContext,
    options: PermissionCheckOptions = {}
  ): boolean {
    const { cache = true, requireAll = false } = options;

    // 超级管理员拥有所有权限
    if (userContext?.isSuperAdmin) {
      return true;
    }

    // 检查缓存
    if (cache && !userContext) {
      const cached = this.config.getCachedPermissions();
      if (cached) {
        return cached.permissions.includes(permissionId);
      }
    }

    // 如果没有提供用户上下文，尝试从当前会话获取
    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return false;
    }

    // 检查权限是否启用
    const permission = this.config.getPermission(permissionId);
    if (!permission?.enabled) {
      return false;
    }

    return userContext.permissions.includes(permissionId);
  }

  /**
   * 检查用户是否拥有所有指定权限
   */
  hasAllPermissions(
    permissionIds: string[],
    userContext?: UserContext,
    options: PermissionCheckOptions = {}
  ): boolean {
    return permissionIds.every(permissionId => 
      this.hasPermission(permissionId, userContext, { ...options, requireAll: true })
    );
  }

  /**
   * 检查用户是否拥有任一指定权限
   */
  hasAnyPermission(
    permissionIds: string[],
    userContext?: UserContext,
    options: PermissionCheckOptions = {}
  ): boolean {
    return permissionIds.some(permissionId => 
      this.hasPermission(permissionId, userContext, options)
    );
  }

  /**
   * 检查用户是否拥有指定角色
   */
  hasRole(roleId: string, userContext?: UserContext): boolean {
    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return false;
    }

    return userContext.roles.includes(roleId);
  }

  /**
   * 检查用户是否拥有任一指定角色
   */
  hasAnyRole(roleIds: string[], userContext?: UserContext): boolean {
    return roleIds.some(roleId => this.hasRole(roleId, userContext));
  }

  /**
   * 检查路由权限
   */
  checkRoutePermission(
    path: string,
    method: string = 'GET',
    userContext?: UserContext
  ): boolean {
    const routePermissions = this.config.getRoutePermissions(path, method);
    
    if (routePermissions.length === 0) {
      return true; // 没有配置权限的路由默认允许访问
    }

    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return false;
    }

    return routePermissions.every(routePermission => {
      if (routePermission.requiredPermissions.length === 0) {
        return true;
      }

      return this.hasAnyPermission(routePermission.requiredPermissions, userContext);
    });
  }

  /**
   * 获取用户可访问的路由
   */
  getAccessibleRoutes(userContext?: UserContext): string[] {
    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return [];
    }

    const accessibleRoutes: string[] = [];
    const seenPaths = new Set<string>();

    // 获取所有路由权限配置
    const allRoutePermissions = this.config.getRoutePermissions('/', 'GET');
    
    for (const routePermission of allRoutePermissions) {
      if (!seenPaths.has(routePermission.path)) {
        if (this.checkRoutePermission(routePermission.path, 'GET', userContext)) {
          accessibleRoutes.push(routePermission.path);
          seenPaths.add(routePermission.path);
        }
      }
    }

    return accessibleRoutes;
  }

  /**
   * 获取用户权限菜单
   */
  getMenuPermissions(userContext?: UserContext): Array<{
    path: string;
    title: string;
    icon?: string;
    requiredPermissions: string[];
  }> {
    const menuItems = [
      {
        path: '/admin',
        title: '仪表盘',
        icon: 'dashboard',
        requiredPermissions: ['dashboard:view'],
      },
      {
        path: '/admin/users',
        title: '用户管理',
        icon: 'users',
        requiredPermissions: ['user:list'],
      },
      {
        path: '/admin/roles',
        title: '角色管理',
        icon: 'shield',
        requiredPermissions: ['role:list'],
      },
      {
        path: '/admin/system',
        title: '系统设置',
        icon: 'settings',
        requiredPermissions: ['system:config:view'],
      },
    ];

    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return [];
    }

    return menuItems.filter(item => 
      this.hasAnyPermission(item.requiredPermissions, userContext)
    );
  }

  /**
   * 缓存用户上下文
   */
  cacheUserContext(userContext: UserContext): void {
    this.userContextCache.set(userContext.id, userContext);
    this.config.cacheUserPermissions(userContext.permissions, userContext.roles);
  }

  /**
   * 清除用户上下文缓存
   */
  clearUserContextCache(userId?: string): void {
    if (userId) {
      this.userContextCache.delete(userId);
    } else {
      this.userContextCache.clear();
    }
    this.config.invalidateCache();
  }

  /**
   * 从当前会话获取用户上下文
   */
  private getCurrentUserContext(): UserContext | undefined {
    if (typeof window === 'undefined') return undefined;

    // 尝试从JWT令牌获取用户信息
    const accessToken = SimplifiedTokenStorage.getAccessToken();
    if (!accessToken) return undefined;

    try {
      const payload = this.parseJWT(accessToken);
      if (!payload) return undefined;

      // 检查缓存
      const cached = this.userContextCache.get(payload.sub);
      if (cached) {
        return cached;
      }

      // 创建用户上下文
      const userContext: UserContext = {
        id: payload.sub,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        isSuperAdmin: payload.is_super_admin || false,
      };

      // 缓存用户上下文
      this.cacheUserContext(userContext);

      return userContext;
    } catch (error) {
      console.error('Error parsing user context:', error);
      return undefined;
    }
  }

  /**
   * 解析JWT令牌
   */
  private parseJWT(token: string): any {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * 刷新权限缓存
   */
  async refreshPermissions(): Promise<void> {
    const userContext = this.getCurrentUserContext();
    if (userContext) {
      // 在实际应用中，这里可以调用API获取最新的权限信息
      this.clearUserContextCache(userContext.id);
      this.cacheUserContext(userContext);
    }
  }

  /**
   * 获取权限统计
   */
  getPermissionStats() {
    return this.config.getStats();
  }

  /**
   * 添加自定义权限
   */
  addPermission(permission: {
    id: string;
    name: string;
    description: string;
    resource: string;
    action: 'view' | 'create' | 'edit' | 'delete' | 'execute';
    category: string;
  }): void {
    this.config.addPermission({
      ...permission,
      isSystem: false,
      enabled: true,
    });
  }

  /**
   * 检查权限是否有效
   */
  isPermissionValid(permissionId: string): boolean {
    const permission = this.config.getPermission(permissionId);
    return permission?.enabled || false;
  }

  /**
   * 获取用户所有有效权限
   */
  getUserEffectivePermissions(userContext?: UserContext): string[] {
    if (!userContext) {
      userContext = this.getCurrentUserContext();
    }

    if (!userContext) {
      return [];
    }

    return userContext.permissions.filter(permissionId => 
      this.isPermissionValid(permissionId)
    );
  }
}