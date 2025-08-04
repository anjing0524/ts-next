/**
 * DynamicPermissionConfig - 动态权限配置系统
 * 
 * 支持运行时配置权限，提供灵活的权限管理
 */

export interface PermissionConfig {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: 'view' | 'create' | 'edit' | 'delete' | 'execute';
  category: string;
  isSystem: boolean;
  enabled: boolean;
}

export interface RoutePermission {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  requiredPermissions: string[];
  requiresAuth: boolean;
  role?: string[];
}

export interface PermissionCache {
  permissions: Set<string>;
  roles: string[];
  expiresAt: number;
}

export class DynamicPermissionConfig {
  private static instance: DynamicPermissionConfig;
  private permissions: Map<string, PermissionConfig> = new Map();
  private routePermissions: RoutePermission[] = [];
  private cache: PermissionCache | null = null;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.initializeDefaultPermissions();
  }

  static getInstance(): DynamicPermissionConfig {
    if (!DynamicPermissionConfig.instance) {
      DynamicPermissionConfig.instance = new DynamicPermissionConfig();
    }
    return DynamicPermissionConfig.instance;
  }

  /**
   * 初始化默认权限配置
   */
  private initializeDefaultPermissions(): void {
    const defaultPermissions: PermissionConfig[] = [
      // Dashboard permissions
      {
        id: 'dashboard:view',
        name: '查看仪表盘',
        description: '允许用户查看管理仪表盘',
        resource: 'dashboard',
        action: 'view',
        category: 'dashboard',
        isSystem: true,
        enabled: true,
      },

      // User management permissions
      {
        id: 'user:list',
        name: '查看用户列表',
        description: '允许用户查看用户列表',
        resource: 'user',
        action: 'view',
        category: 'user_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'user:create',
        name: '创建用户',
        description: '允许用户创建新用户',
        resource: 'user',
        action: 'create',
        category: 'user_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'user:edit',
        name: '编辑用户',
        description: '允许用户编辑现有用户',
        resource: 'user',
        action: 'edit',
        category: 'user_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'user:delete',
        name: '删除用户',
        description: '允许用户删除用户',
        resource: 'user',
        action: 'delete',
        category: 'user_management',
        isSystem: true,
        enabled: true,
      },

      // Role management permissions
      {
        id: 'role:list',
        name: '查看角色列表',
        description: '允许用户查看角色列表',
        resource: 'role',
        action: 'view',
        category: 'role_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'role:create',
        name: '创建角色',
        description: '允许用户创建新角色',
        resource: 'role',
        action: 'create',
        category: 'role_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'role:edit',
        name: '编辑角色',
        description: '允许用户编辑现有角色',
        resource: 'role',
        action: 'edit',
        category: 'role_management',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'role:delete',
        name: '删除角色',
        description: '允许用户删除角色',
        resource: 'role',
        action: 'delete',
        category: 'role_management',
        isSystem: true,
        enabled: true,
      },

      // System permissions
      {
        id: 'system:config:view',
        name: '查看系统配置',
        description: '允许用户查看系统配置',
        resource: 'system_config',
        action: 'view',
        category: 'system',
        isSystem: true,
        enabled: true,
      },
      {
        id: 'system:config:edit',
        name: '编辑系统配置',
        description: '允许用户编辑系统配置',
        resource: 'system_config',
        action: 'edit',
        category: 'system',
        isSystem: true,
        enabled: true,
      },
    ];

    defaultPermissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });

    this.initializeRoutePermissions();
  }

  /**
   * 初始化路由权限配置
   */
  private initializeRoutePermissions(): void {
    this.routePermissions = [
      {
        path: '/admin',
        method: 'GET',
        requiredPermissions: ['dashboard:view'],
        requiresAuth: true,
      },
      {
        path: '/admin/users',
        method: 'GET',
        requiredPermissions: ['user:list'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/users',
        method: 'GET',
        requiredPermissions: ['user:list'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/users',
        method: 'POST',
        requiredPermissions: ['user:create'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/users/:id',
        method: 'PUT',
        requiredPermissions: ['user:edit'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/users/:id',
        method: 'DELETE',
        requiredPermissions: ['user:delete'],
        requiresAuth: true,
      },
      {
        path: '/admin/roles',
        method: 'GET',
        requiredPermissions: ['role:list'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/roles',
        method: 'GET',
        requiredPermissions: ['role:list'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/roles',
        method: 'POST',
        requiredPermissions: ['role:create'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/roles/:id',
        method: 'PUT',
        requiredPermissions: ['role:edit'],
        requiresAuth: true,
      },
      {
        path: '/api/v1/roles/:id',
        method: 'DELETE',
        requiredPermissions: ['role:delete'],
        requiresAuth: true,
      },
      {
        path: '/admin/system/config',
        method: 'GET',
        requiredPermissions: ['system:config:view'],
        requiresAuth: true,
      },
      {
        path: '/admin/system/config',
        method: 'POST',
        requiredPermissions: ['system:config:edit'],
        requiresAuth: true,
      },
    ];
  }

  /**
   * 添加权限配置
   */
  addPermission(permission: PermissionConfig): void {
    this.permissions.set(permission.id, permission);
    this.invalidateCache();
  }

  /**
   * 移除权限配置
   */
  removePermission(permissionId: string): boolean {
    const removed = this.permissions.delete(permissionId);
    if (removed) {
      this.invalidateCache();
    }
    return removed;
  }

  /**
   * 更新权限配置
   */
  updatePermission(permissionId: string, updates: Partial<PermissionConfig>): boolean {
    const permission = this.permissions.get(permissionId);
    if (!permission) return false;

    const updated = { ...permission, ...updates };
    this.permissions.set(permissionId, updated);
    this.invalidateCache();
    return true;
  }

  /**
   * 获取权限配置
   */
  getPermission(permissionId: string): PermissionConfig | undefined {
    return this.permissions.get(permissionId);
  }

  /**
   * 获取所有权限
   */
  getAllPermissions(): PermissionConfig[] {
    return Array.from(this.permissions.values());
  }

  /**
   * 按类别获取权限
   */
  getPermissionsByCategory(category: string): PermissionConfig[] {
    return Array.from(this.permissions.values()).filter(p => p.category === category);
  }

  /**
   * 启用/禁用权限
   */
  setPermissionEnabled(permissionId: string, enabled: boolean): boolean {
    const permission = this.permissions.get(permissionId);
    if (!permission) return false;

    permission.enabled = enabled;
    this.invalidateCache();
    return true;
  }

  /**
   * 添加路由权限
   */
  addRoutePermission(routePermission: RoutePermission): void {
    this.routePermissions.push(routePermission);
    this.invalidateCache();
  }

  /**
   * 获取路由权限
   */
  getRoutePermissions(path: string, method?: string): RoutePermission[] {
    return this.routePermissions.filter(rp => {
      const pathMatches = path.startsWith(rp.path) || 
                         this.isDynamicRouteMatch(path, rp.path);
      const methodMatches = !method || method === rp.method;
      return pathMatches && methodMatches;
    });
  }

  /**
   * 检查动态路由匹配
   */
  private isDynamicRouteMatch(requestPath: string, routePath: string): boolean {
    const routeSegments = routePath.split('/');
    const requestSegments = requestPath.split('/');

    if (routeSegments.length !== requestSegments.length) return false;

    return routeSegments.every((segment, index) => {
      if (segment.startsWith(':')) return true; // Dynamic segment
      return segment === requestSegments[index];
    });
  }

  /**
   * 检查权限
   */
  checkPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    if (requiredPermissions.length === 0) return true;

    return requiredPermissions.every(required => {
      const permission = this.permissions.get(required);
      return permission?.enabled && userPermissions.includes(required);
    });
  }

  /**
   * 缓存用户权限
   */
  cacheUserPermissions(permissions: string[], roles: string[]): void {
    this.cache = {
      permissions: new Set(permissions),
      roles,
      expiresAt: Date.now() + this.cacheTTL,
    };
  }

  /**
   * 获取缓存的权限
   */
  getCachedPermissions(): { permissions: string[]; roles: string[] } | null {
    if (!this.cache || Date.now() > this.cache.expiresAt) {
      return null;
    }

    return {
      permissions: Array.from(this.cache.permissions),
      roles: this.cache.roles,
    };
  }

  /**
   * 检查缓存的权限
   */
  checkCachedPermission(permissionId: string): boolean {
    if (!this.cache || Date.now() > this.cache.expiresAt) {
      return false;
    }

    return this.cache.permissions.has(permissionId);
  }

  /**
   * 无效化缓存
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * 导出配置
   */
  exportConfig(): {
    permissions: PermissionConfig[];
    routePermissions: RoutePermission[];
  } {
    return {
      permissions: this.getAllPermissions(),
      routePermissions: [...this.routePermissions],
    };
  }

  /**
   * 导入配置
   */
  importConfig(config: {
    permissions: PermissionConfig[];
    routePermissions: RoutePermission[];
  }): void {
    this.permissions.clear();
    this.routePermissions = [];

    config.permissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });

    this.routePermissions = [...config.routePermissions];
    this.invalidateCache();
  }

  /**
   * 获取权限统计
   */
  getStats(): {
    totalPermissions: number;
    enabledPermissions: number;
    systemPermissions: number;
    customPermissions: number;
    categories: string[];
  } {
    const allPermissions = this.getAllPermissions();
    const categories = [...new Set(allPermissions.map(p => p.category))];

    return {
      totalPermissions: allPermissions.length,
      enabledPermissions: allPermissions.filter(p => p.enabled).length,
      systemPermissions: allPermissions.filter(p => p.isSystem).length,
      customPermissions: allPermissions.filter(p => !p.isSystem).length,
      categories,
    };
  }
}