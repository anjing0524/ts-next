import { adminApi, PaginatedResponse } from '../../../lib/api';
import { IPermissionRepository } from '../domain/permission.repository';
import { Permission } from '../domain/permission';

export class PermissionRepository implements IPermissionRepository {
  async getPermissions(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Permission>> {
    return adminApi.getPermissions(params);
  }

  async getPermissionById(permissionId: string): Promise<Permission> {
    // adminApi currently doesn't have getPermissionById, so we'll simulate or add it later
    // For now, we can return a dummy or throw an error
    throw new Error('Method not implemented: getPermissionById');
  }
}
