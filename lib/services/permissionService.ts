import { prisma } from '@/lib/prisma';
import { Role, UserRole, Permission } from '@prisma/client'; // Ensure these are available if needed by other parts of the class

// Define a type for the structure of permission requests in checkBatchPermissions
interface PermissionCheckRequest {
  id?: string; // Optional request identifier
  name: string; // Canonical permission name (e.g., "users:list:api")
}

// Define a type for the structure of results from checkBatchPermissions
interface BatchPermissionCheckResult {
  id?: string; // Optional request identifier, mirrored from request
  allowed: boolean;
  reasonCode?: 'PERMISSION_GRANTED' | 'PERMISSION_DENIED' | 'NO_PERMISSIONS' | 'INVALID_REQUEST_FORMAT';
  message?: string;
}

export class PermissionService {
  // In-memory cache for user permissions
  private permissionCache = new Map<string, { permissions: Set<string>, timestamp: number }>();
  private cacheDurationMs = 15 * 60 * 1000; // 15 minutes

  // Placeholder for a Redis client if it were available
  // private redisClient; //: Redis | undefined;
  // constructor() {
  //   // Initialize Redis client here if applicable
  //   // if (process.env.REDIS_URL) {
  //   //   this.redisClient = new Redis(process.env.REDIS_URL);
  //   // }
  // }

  /**
   * Retrieves all effective permissions for a given user.
   * Permissions are returned as a Set of canonical permission names (e.g., "users:list", "documents:read:financial").
   * This method considers active user, active roles, active role-permission links, and active permissions.
   * It now includes an in-memory cache with time-based expiration and placeholders for Redis integration.
   *
   * @param userId The ID of the user.
   * @returns A Promise that resolves to a Set of effective permission strings.
   */
  public async getUserEffectivePermissions(userId: string): Promise<Set<string>> {
    const cacheKey = `user:${userId}:permissions`;

    // 1. Try fetching from in-memory cache
    const cachedEntry = this.permissionCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < this.cacheDurationMs)) {
      // console.log(`[In-Memory Cache HIT] Permissions for user ${userId}`);
      return new Set(cachedEntry.permissions); // Return a copy to prevent external modification
    }

    // TODO: Replace with actual Redis GET call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // const cachedPermissionsJson = await this.redisClient.get(cacheKey);
    //     // if (cachedPermissionsJson) {
    //     //   const permissionsArray = JSON.parse(cachedPermissionsJson) as string[];
    //     //   console.log(`[Redis Cache HIT] Permissions for user ${userId}`);
    //     //   // Store in local in-memory cache for short-term hot access & set timestamp
    //     //   const permissionsSet = new Set(permissionsArray);
    //     //   this.permissionCache.set(cacheKey, { permissions: permissionsSet, timestamp: Date.now() });
    //     //   return permissionsSet;
    //     // }
    //   } catch (err) {
    //     // console.error(`Redis GET error for key ${cacheKey}:`, err);
    //     // Fall through to DB fetch if Redis fails
    //   }
    // }

    // 2. If not in cache or expired, fetch from database
    // console.log(`[Cache MISS] Fetching permissions from DB for user ${userId}`);
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId, isActive: true }, // Ensure user is active
      include: {
        userRoles: {
          where: {
            role: { isActive: true }, // Ensure role is active
          },
          include: {
            role: {
              include: {
                rolePermissions: {
                  where: {
                    permission: { isActive: true }, // Ensure permission is active
                  },
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userWithRoles) {
      // Cache an empty set for users with no roles/permissions to avoid repeated DB queries for them
      const emptyPermissions = new Set<string>();
      this.permissionCache.set(cacheKey, { permissions: new Set(emptyPermissions), timestamp: Date.now() });
      // if (this.redisClient) { try { await this.redisClient.set(cacheKey, JSON.stringify([]), 'EX', 900); } catch(e){ /* ignore */ } }
      return emptyPermissions;
    }

    const effectivePermissions = new Set<string>();
    userWithRoles.userRoles.forEach(userRole => {
      userRole.role.rolePermissions.forEach(rolePermission => {
        if (rolePermission.permission && rolePermission.permission.name) {
          effectivePermissions.add(rolePermission.permission.name);
        }
      });
    });

    // 3. Store in in-memory cache
    this.permissionCache.set(cacheKey, { permissions: new Set(effectivePermissions), timestamp: Date.now() });

    // TODO: Replace with actual Redis SET call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // Store as JSON array in Redis with 15 min expiry (900 seconds)
    //     // await this.redisClient.set(cacheKey, JSON.stringify(Array.from(effectivePermissions)), 'EX', 900);
    //   } catch (err) {
    //     // console.error(`Redis SET error for key ${cacheKey}:`, err);
    //     // Failure to cache should not fail the main operation
    //   }
    // }

    return effectivePermissions;
  }

  /**
   * Clears the cached permissions for a specific user from the in-memory cache.
   * This should be called when a user's roles or direct permissions change to ensure fresh data is fetched.
   * Includes placeholders for Redis cache clearing.
   * @param userId The ID of the user whose permission cache should be cleared.
   */
  public async clearUserPermissionCache(userId: string): Promise<void> {
    const cacheKey = `user:${userId}:permissions`;
    this.permissionCache.delete(cacheKey);
    // console.log(`[In-Memory Cache Cleared] Permissions for user ${userId}`);

    // TODO: Replace with actual Redis DEL call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // await this.redisClient.del(cacheKey);
    //     // console.log(`[Redis Cache Cleared] Permissions for user ${userId}`);
    //   } catch (err) {
    //     // console.error(`Redis DEL error for key ${cacheKey}:`, err);
    //   }
    // }
  }

  /**
   * Checks if a user has a specific permission.
   *
   * @param userId The ID of the user.
   * @param requiredPermission The canonical name of the permission to check (e.g., "users:list").
   * @returns A Promise that resolves to true if the user has the permission, false otherwise.
   */
  public async checkPermission(userId: string, requiredPermission: string): Promise<boolean> {
    if (!requiredPermission) {
        // console.warn('checkPermission called with empty requiredPermission');
        return false;
    }
    const userPermissions = await this.getUserEffectivePermissions(userId);
    return userPermissions.has(requiredPermission);
  }

  /**
   * Checks a batch of permission requests for a given user.
   * This version expects permission requests where permissions are identified by their canonical name.
   *
   * @param userId The ID of the user.
   * @param requests An array of PermissionCheckRequest objects, each with a 'name' field.
   * @returns A Promise that resolves to an array of BatchPermissionCheckResult objects.
   */
  public async checkBatchPermissions(userId: string, requests: PermissionCheckRequest[]): Promise<BatchPermissionCheckResult[]> {
    if (!requests || requests.length === 0) {
      return [];
    }

    const userPermissionsSet = await this.getUserEffectivePermissions(userId); // This call will now use the cache
    const results: BatchPermissionCheckResult[] = [];

    for (const req of requests) {
      if (!req.name) { // Check if the canonical name is provided
        results.push({
          id: req.id,
          allowed: false,
          reasonCode: 'INVALID_REQUEST_FORMAT',
          message: 'Request missing canonical permission name.',
        });
        continue;
      }

      const isAllowed = userPermissionsSet.has(req.name);

      let message = '';
      let reasonCode: BatchPermissionCheckResult['reasonCode'] = 'PERMISSION_DENIED';

      if (isAllowed) {
        message = 'Operation allowed.';
        reasonCode = 'PERMISSION_GRANTED';
      } else {
        if (userPermissionsSet.size === 0) {
          message = 'User has no effective permissions.';
          reasonCode = 'NO_PERMISSIONS';
        } else {
          message = `Permission '${req.name}' denied or not found in user's effective permissions.`;
          reasonCode = 'PERMISSION_DENIED';
        }
      }

      results.push({
        id: req.id,
        allowed: isAllowed,
        reasonCode: reasonCode,
        message: message,
      });
    }
    return results;
  }
}

// Optional: Export an instance if you prefer singleton-like usage, though typically services are instantiated.
// export const permissionService = new PermissionService();
