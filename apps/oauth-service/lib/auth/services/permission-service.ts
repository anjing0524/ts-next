import { Prisma, Permission, PermissionType } from '@prisma/client';
import { prisma } from '@repo/database';
import { logger } from '@repo/lib/node';
import { CacheManager, CacheInterface } from '@repo/cache/src/cache-manager';

interface PermissionCheckRequest {
  id?: string;
  name: string;
}

interface BatchPermissionCheckResult {
  id?: string;
  allowed: boolean;
  reasonCode?:
    | 'PERMISSION_GRANTED'
    | 'PERMISSION_DENIED'
    | 'NO_PERMISSIONS'
    | 'INVALID_REQUEST_FORMAT';
  message?: string;
}

export class PermissionService {
  private cache: CacheInterface;

  constructor() {
    this.cache = CacheManager.getInstance().getCache();
    logger.info('PermissionService initialized with cache manager');
  }

  public async getUserEffectivePermissions(userId: string): Promise<Set<string>> {
    const cacheKey = `user:${userId}:permissions`;
    try {
      const cachedData = await this.cache.get<string[]>(cacheKey);
      if (cachedData) {
        logger.debug(`[Cache HIT] Permissions for user ${userId}`);
        return new Set(cachedData);
      }
    } catch (error) {
      logger.error('Error reading from cache:', error);
    }
    logger.debug(`[DB Fetch] Fetching permissions from DB for user ${userId}`);
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        userRoles: {
          where: { role: { isActive: true }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          include: {
            role: {
              include: {
                rolePermissions: {
                  where: { permission: { isActive: true } },
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
    if (!userWithRoles) {
      const emptyPermissions = new Set<string>();
      await this.cache.set(cacheKey, [], 900);
      logger.debug(`[Cache SET] Empty permissions for user ${userId} stored in cache.`);
      return emptyPermissions;
    }
    const effectivePermissions = new Set<string>();
    userWithRoles.userRoles.forEach((userRole: any) => {
      if (userRole.role && userRole.role.isActive) {
        const isExpired = userRole.expiresAt && userRole.expiresAt.getTime() <= Date.now();
        if (!isExpired) {
          userRole.role.rolePermissions.forEach((rolePermission: { permission: { isActive: boolean; name: string; }; }) => {
            if (
              rolePermission.permission &&
              rolePermission.permission.isActive &&
              rolePermission.permission.name
            ) {
              effectivePermissions.add(rolePermission.permission.name);
            }
          });
        }
      }
    });
    const permissionsArray = Array.from(effectivePermissions);
    await this.cache.set(cacheKey, permissionsArray, 900);
    logger.debug(`[Cache SET] Permissions for user ${userId} stored in cache.`);
    return effectivePermissions;
  }

  public async clearUserPermissionCache(userId: string): Promise<void> {
    const cacheKey = `user:${userId}:permissions`;
    try {
      await this.cache.del(cacheKey);
      logger.info(`[Cache Cleared] Permissions for user ${userId}`);
    } catch (error) {
      logger.error(`[PermissionService] Cache DEL error for key ${cacheKey}:`, error);
    }
  }

  public async clearCachesAffectedByRoleChange(roleId: string): Promise<void> {
    logger.info(
      `[Cache Invalidation] Role ${roleId} changed. Clearing all user permission caches.`
    );
    try {
      await this.cache.clear();
      logger.debug('[Cache] All user permission caches cleared due to role change.');
    } catch (error) {
      logger.error('[PermissionService] Error clearing caches after role change:', error);
    }
  }

  public async checkPermission(userId: string, requiredPermission: string): Promise<boolean> {
    if (!requiredPermission) {
      return false;
    }
    const userPermissions = await this.getUserEffectivePermissions(userId);
    return userPermissions.has(requiredPermission);
  }

  public async checkBatchPermissions(
    userId: string,
    requests: PermissionCheckRequest[]
  ): Promise<BatchPermissionCheckResult[]> {
    if (!requests || requests.length === 0) {
      return [];
    }
    const userPermissionsSet = await this.getUserEffectivePermissions(userId);
    const results: BatchPermissionCheckResult[] = [];
    for (const req of requests) {
      if (!req.name) {
        results.push({
          id: req.id,
          allowed: false,
          reasonCode: 'INVALID_REQUEST_FORMAT',
          message: 'Permission name is required',
        });
        continue;
      }
      results.push({
        id: req.id,
        allowed: userPermissionsSet.has(req.name),
        reasonCode: userPermissionsSet.has(req.name)
          ? 'PERMISSION_GRANTED'
          : 'PERMISSION_DENIED',
      });
    }
    return results;
  }
}

/**
 * 分页查询权限列表
 * @param params 查询参数
 */
export async function listPermissions(params: {
  page: number;
  pageSize: number;
  name?: string;
  type?: PermissionType;
  resource?: string;
  action?: string;
}) {
  const { page, pageSize, name, type, resource, action } = params;
  const where: Prisma.PermissionWhereInput = {};
  if (name) where.name = { contains: name };
  if (type) where.type = type;
  if (resource) where.resource = { contains: resource };
  if (action) where.action = { contains: action };

  const permissions = await prisma.permission.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  });
  const total = await prisma.permission.count({ where });
  return {
    permissions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 创建新权限
 * @param data 权限数据
 */
export async function createPermission(data: Prisma.PermissionCreateInput) {
  const newPermission = await prisma.permission.create({
    data,
  });
  return newPermission;
} 