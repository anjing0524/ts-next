import { Role, CreateRoleInput, UpdateRoleInput } from './role';
import { PaginatedResponse } from '../../../lib/api';

export interface IRoleRepository {
  getRoles(params?: { offset?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Role>>;
  getRoleById(roleId: string): Promise<Role>;
  createRole(roleData: CreateRoleInput): Promise<Role>;
  updateRole(roleId: string, roleData: UpdateRoleInput): Promise<Role>;
  deleteRole(roleId: string): Promise<void>;
  updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void>;
}
