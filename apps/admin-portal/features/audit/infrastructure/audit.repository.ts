import { api, PaginatedResponse } from '../../../lib/api';
import { IAuditLogRepository } from '../domain/audit.repository';
import { AuditLog, AuditLogFilters } from '../domain/audit';

export class AuditLogRepository implements IAuditLogRepository {
  async getAuditLogs(params?: AuditLogFilters): Promise<PaginatedResponse<AuditLog>> {
    return api.getAuditLogs(params);
  }
}
