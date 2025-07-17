import { IPermissionRepository } from '../domain/permission.repository';
import { Permission } from '../domain/permission';
import { PaginatedResponse } from '../../../lib/api';

export class PermissionService {
  constructor(private permissionRepository: IPermissionRepository) {}

  async getPermissions(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Permission>> {
    return this.permissionRepository.getPermissions(params);
  }

  async getPermissionById(permissionId: string): Promise<Permission> {
    return this.permissionRepository.getPermissionById(permissionId);
  }
}
