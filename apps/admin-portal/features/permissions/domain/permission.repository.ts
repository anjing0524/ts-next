import { Permission } from './permission';
import { PaginatedResponse } from '../../../lib/api';

export interface IPermissionRepository {
  getPermissions(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Permission>>;
  getPermissionById(permissionId: string): Promise<Permission>;
  // Add other CRUD operations if needed
}
