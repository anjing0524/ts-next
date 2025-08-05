/**
 * 服务工厂模块
 * 统一管理所有服务的创建和依赖注入
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { PrismaClient } from '@prisma/client';
import { cache } from '@repo/cache';
import { KeyService } from '@repo/lib/node';

/**
 * 服务容器接口
 */
export interface ServiceContainer {
  // 数据库
  prisma: PrismaClient;
  
  // 缓存
  cache: typeof cache;
  
  // 密钥服务
  keyService: KeyService;
  
  // 获取其他服务的工厂方法
  getAuthService(): any;
  getUserService(): any;
  getClientService(): any;
  getRoleService(): any;
  getPermissionService(): any;
  getRBACService(): any;
  getCleanupService(): any;
  
  // 初始化和清理方法
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * 服务实现类
 */
class OAuthServiceContainer implements ServiceContainer {
  private _prisma: PrismaClient | null = null;
  private _keyService: KeyService | null = null;
  
  // 延迟加载的服务
  private _authService: any = null;
  private _userService: any = null;
  private _clientService: any = null;
  private _roleService: any = null;
  private _permissionService: any = null;
  private _rbacService: any = null;
  private _cleanupService: any = null;

  get prisma(): PrismaClient {
    if (!this._prisma) {
      this._prisma = new PrismaClient();
    }
    return this._prisma;
  }

  get cache(): typeof cache {
    return cache;
  }

  get keyService(): KeyService {
    if (!this._keyService) {
      this._keyService = KeyService.getInstance();
    }
    return this._keyService;
  }

  getAuthService() {
    if (!this._authService) {
      const { AuthorizationCodeService } = require('./services/authorization-code-service');
      this._authService = new AuthorizationCodeService(this);
    }
    return this._authService;
  }

  getUserService() {
    if (!this._userService) {
      const { UserService } = require('./services/user-service');
      this._userService = new UserService(this);
    }
    return this._userService;
  }

  getClientService() {
    if (!this._clientService) {
      const { ClientService } = require('./services/client-service');
      this._clientService = new ClientService(this);
    }
    return this._clientService;
  }

  getRoleService() {
    if (!this._roleService) {
      const { RoleService } = require('./services/role-service');
      this._roleService = new RoleService(this);
    }
    return this._roleService;
  }

  getPermissionService() {
    if (!this._permissionService) {
      const { PermissionService } = require('./services/permission-service');
      this._permissionService = new PermissionService(this);
    }
    return this._permissionService;
  }

  getRBACService() {
    if (!this._rbacService) {
      const { RBACService } = require('./services/rbac-service');
      this._rbacService = new RBACService(this);
    }
    return this._rbacService;
  }

  getCleanupService() {
    if (!this._cleanupService) {
      const { CleanupService } = require('./services/cleanup-service');
      this._cleanupService = new CleanupService(this);
    }
    return this._cleanupService;
  }

  /**
   * 初始化所有服务
   */
  async initialize(): Promise<void> {
    try {
      // 连接数据库
      await this.prisma.$connect();
      console.log('[ServiceContainer] Database connected');
      
      // 初始化密钥服务
      await this.keyService;
      console.log('[ServiceContainer] Key service initialized');
      
      // 预热缓存
      await this.cache.get('warmup');
      console.log('[ServiceContainer] Cache service ready');
      
      console.log('[ServiceContainer] All services initialized successfully');
    } catch (error) {
      console.error('[ServiceContainer] Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      if (this._prisma) {
        await this._prisma.$disconnect();
        this._prisma = null;
      }
      
      // 清理其他服务资源
      this._authService = null;
      this._userService = null;
      this._clientService = null;
      this._roleService = null;
      this._permissionService = null;
      this._rbacService = null;
      this._cleanupService = null;
      
      console.log('[ServiceContainer] All services cleaned up');
    } catch (error) {
      console.error('[ServiceContainer] Error during cleanup:', error);
    }
  }
}

// 创建全局服务容器实例
let serviceContainer: OAuthServiceContainer | null = null;

/**
 * 获取服务容器实例
 */
export function getServiceContainer(): ServiceContainer {
  if (!serviceContainer) {
    serviceContainer = new OAuthServiceContainer();
  }
  return serviceContainer;
}

/**
 * 初始化服务容器
 */
export async function initializeServices(): Promise<void> {
  const container = getServiceContainer();
  await container.initialize();
}

/**
 * 清理服务容器
 */
export async function cleanupServices(): Promise<void> {
  if (serviceContainer) {
    await serviceContainer.cleanup();
    serviceContainer = null;
  }
}

/**
 * 依赖注入装饰器（用于类）
 */
export function Inject(serviceName: keyof ServiceContainer) {
  return function (target: any, propertyKey: string) {
    Object.defineProperty(target, propertyKey, {
      get() {
        const container = getServiceContainer();
        return container[serviceName];
      },
      enumerable: true,
      configurable: true
    });
  };
}

/**
 * 创建带有依赖注入的类工厂
 */
export function createServiceFactory<T>(ServiceClass: new (container: ServiceContainer) => T) {
  return () => {
    const container = getServiceContainer();
    return new ServiceClass(container);
  };
}