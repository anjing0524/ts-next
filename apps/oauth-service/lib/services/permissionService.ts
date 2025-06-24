/**
 * 权限服务
 * 使用 @repo/lib 包的权限服务
 */
import { prisma } from '@repo/database/client';
export { PermissionService } from '@repo/lib/services/permissionService'; 

// 创建一个预配置的实例供oauth-service使用
// Create a pre-configured instance for oauth-service use
export const permissionServiceInstance = new (require('@repo/lib/services/permissionService').PermissionService)(prisma); 