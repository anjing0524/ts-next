import { IPermissionRepository } from '../domain/permission.repository';
import { Permission } from '../domain/permission';
import { PaginatedResponse } from '../../../lib/api';

export class PermissionService {
  constructor(private permissionRepository: IPermissionRepository) {}

  async getPermissions(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Permission>> {
    // 转换 page 参数为 offset 参数
    const repositoryParams = params ? {
      offset: params.page ? (params.page - 1) * (params.limit || 10) : undefined,
      limit: params.limit,
      search: params.search
    } : undefined;
    
    return this.permissionRepository.getPermissions(repositoryParams);
  }

  async getPermissionById(permissionId: string): Promise<Permission> {
    return this.permissionRepository.getPermissionById(permissionId);
  }
}
