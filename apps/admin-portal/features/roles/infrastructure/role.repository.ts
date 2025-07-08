import { adminApi, PaginatedResponse } from '../../../lib/api';
import { IRoleRepository } from '../domain/role.repository';
import { Role, CreateRoleInput, UpdateRoleInput } from '../domain/role';

export class RoleRepository implements IRoleRepository {
  async getRoles(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Role>> {
    return adminApi.getRoles(params);
  }

  async getRoleById(roleId: string): Promise<Role> {
    return adminApi.getRoleById(roleId);
  }

  async createRole(roleData: CreateRoleInput): Promise<Role> {
    return adminApi.createRole(roleData);
  }

  async updateRole(roleId: string, roleData: UpdateRoleInput): Promise<Role> {
    return adminApi.updateRole(roleId, roleData);
  }

  async deleteRole(roleId: string): Promise<void> {
    return adminApi.deleteRole(roleId);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    return adminApi.updateRolePermissions(roleId, permissionIds);
  }
}
