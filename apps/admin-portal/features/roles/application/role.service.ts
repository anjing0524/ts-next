import { IRoleRepository } from '../domain/role.repository';
import { Role, CreateRoleInput, UpdateRoleInput } from '../domain/role';
import { PaginatedResponse } from '../../../lib/api';

export class RoleService {
  constructor(private roleRepository: IRoleRepository) {}

  async getRoles(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Role>> {
    return this.roleRepository.getRoles(params);
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
