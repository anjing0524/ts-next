import { api, PaginatedResponse } from '../../../lib/api';
import { IRoleRepository } from '../domain/role.repository';
import { Role, CreateRoleInput, UpdateRoleInput } from '../domain/role';

export class RoleRepository implements IRoleRepository {
  async getRoles(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Role>> {
    return api.getRoles(params) as Promise<PaginatedResponse<Role>>;
  }

  async getRoleById(roleId: string): Promise<Role> {
    return api.getRoleById(roleId) as Promise<Role>;
  }

  async createRole(roleData: CreateRoleInput): Promise<Role> {
    // 类型断言，确保返回值为 Promise<Role>
    return api.createRole(roleData) as Promise<Role>;
  }

  async updateRole(roleId: string, roleData: UpdateRoleInput): Promise<Role> {
    // 类型断言，确保返回值为 Promise<Role>
    return api.updateRole(roleId, roleData) as Promise<Role>;
  }

  async deleteRole(roleId: string): Promise<void> {
    // 类型断言，确保返回值为 Promise<void>
    return api.deleteRole(roleId) as Promise<void>;
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    // 类型断言，确保返回值为 Promise<void>
    return api.updateRolePermissions(roleId, permissionIds) as Promise<void>;
  }
}
