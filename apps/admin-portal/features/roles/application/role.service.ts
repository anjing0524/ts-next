import { IRoleRepository } from '../domain/role.repository';
import { Role, CreateRoleInput, UpdateRoleInput } from '../domain/role';
import { PaginatedResponse } from '../../../lib/api';

export class RoleService {
  constructor(private roleRepository: IRoleRepository) {}

  async getRoles(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Role>> {
    // 转换 page 参数为 offset 参数
    const repositoryParams = params ? {
      offset: params.page ? (params.page - 1) * (params.limit || 10) : undefined,
      limit: params.limit,
      search: params.search
    } : undefined;
    
    return this.roleRepository.getRoles(repositoryParams);
  }

  async getRoleById(roleId: string): Promise<Role> {
    return this.roleRepository.getRoleById(roleId);
  }

  async createRole(roleData: CreateRoleInput): Promise<Role> {
    // Add business logic here if needed, e.g., validation, default values
    return this.roleRepository.createRole(roleData);
  }

  async updateRole(roleId: string, roleData: UpdateRoleInput): Promise<Role> {
    // Add business logic here if needed
    return this.roleRepository.updateRole(roleId, roleData);
  }

  async deleteRole(roleId: string): Promise<void> {
    // Add business logic here if needed, e.g., check if role is assigned to users
    return this.roleRepository.deleteRole(roleId);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    // Add business logic here if needed, e.g., permission validation
    return this.roleRepository.updateRolePermissions(roleId, permissionIds);
  }
}
